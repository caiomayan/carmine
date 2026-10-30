import type { Plan } from '@carmine/contracts';
import { and, desc, eq, gt, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, planRevocations, staffAuditLog, vipPeriods } from '../database/schema.js';
import { planStatusOfPeriods } from '../plans/plan-periods.js';
import { type PurchaseWrites, planPurchase } from '../plans/plan-purchase.js';
import type { PlanSegment, PlanStatus } from '../plans/plan-timeline.js';
import { recordStaffAudit, type StaffAction, type Transaction } from '../staff/audit-log.js';
import type { VipStatusAt } from './vip-status.js';

export type { StaffAction } from '../staff/audit-log.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** O VIP de antes (`active`, `endsAt`, `endedAt`) mais o plano (S20): quem é, até quando e o que vem depois. */
export interface PlanVipStatus extends VipStatusAt {
  plan: Plan | null;
  /** O trecho de agora é de teste do beta. */
  test: boolean;
  /** Quando o plano de agora acaba ou muda (o Capo guardado volta depois do Padrinho). */
  planEndsAt: Date | null;
  next: PlanSegment | null;
}

/** Opções de uma concessão: o plano (Capo, se não vier) e se é compra de teste do beta. */
export interface GrantOptions {
  plan?: Plan;
  test?: boolean;
}

const toVip = (status: PlanStatus): PlanVipStatus => ({
  active: status.active,
  endsAt: status.endsAt,
  endedAt: status.endedAt,
  plan: status.plan,
  test: status.test,
  planEndsAt: status.planEndsAt,
  next: status.next,
});

/** Uma linha do log de auditoria da Staff (a visão do CLI). */
export interface StaffAuditEntry {
  actorSteamId: string;
  action: (typeof staffAuditLog.$inferSelect)['action'];
  targetSteamId: string | null;
  reason: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

/** Revogar uma Conta sem plano ativo. */
export class NoVipToRevoke extends Error {
  constructor() {
    super('a Conta não tem plano ativo');
    this.name = 'NoVipToRevoke';
  }
}

/**
 * Períodos VIP das Contas. A Staff concede e revoga (S05) com registro no log de auditoria;
 * `grant` sem `StaffAction` fica para os Pacotes VIP (S14) e os testes.
 */
export class VipPeriods {
  constructor(private readonly db: Database) {}

  /** O VIP da Conta agora: ativo e até quando, somando os Períodos encadeados (qualquer plano). */
  async statusOf(accountId: string, now = new Date()): Promise<VipStatusAt> {
    const { active, endsAt, endedAt } = await this.planStatusOf(accountId, now);
    return { active, endsAt, endedAt };
  }

  /** O plano da Conta agora (S20): qual, até quando, se é de teste e o que vem depois. */
  async planStatusOf(accountId: string, now = new Date()): Promise<PlanVipStatus> {
    // Todos os Períodos: os encerrados dão o `endedAt`. São poucos por Conta.
    const periods = await this.db
      .select({
        startsAt: vipPeriods.startsAt,
        endsAt: vipPeriods.endsAt,
        plan: vipPeriods.plan,
        test: vipPeriods.test,
      })
      .from(vipPeriods)
      .where(eq(vipPeriods.accountId, accountId));
    const revocations = await this.db
      .select({ revokedAt: planRevocations.revokedAt })
      .from(planRevocations)
      .where(eq(planRevocations.accountId, accountId));
    return toVip(
      planStatusOfPeriods(periods, now, { revokedAt: revocations.map((r) => r.revokedAt) }),
    );
  }

  /**
   * Concede `days` dias de VIP a partir de agora ou, com VIP ativo, a partir do fim dele (os
   * dias se somam, como os Pacotes VIP). Com `staff`, registra no log de auditoria na mesma
   * transação. Devolve o VIP resultante.
   */
  async grant(
    accountId: string,
    days: number,
    now = new Date(),
    staff?: StaffAction,
    options: GrantOptions = {},
  ): Promise<VipStatusAt> {
    const plan = options.plan ?? 'capo';
    await this.db.transaction(async (tx) => {
      const steamId = await this.lock(tx, accountId);
      const before = await this.activeStatus(tx, accountId, now);
      const { purchase } = await this.write(tx, accountId, now, {
        plan,
        days,
        test: options.test ?? false,
        paymentId: null,
      });
      if (staff) {
        await this.audit(tx, 'vip_grant', accountId, steamId, staff, now, {
          days,
          plan,
          endsAtBefore: before.endsAt?.toISOString() ?? null,
          endsAtAfter: purchase.endsAt.toISOString(),
        });
      }
    });
    return this.statusOf(accountId, now);
  }

  /**
   * Concede os dias de um Pacote pago (S14) dentro da transação do pagamento: soma ao VIP ativo e
   * liga o Período ao pagamento (`payment_id`, único: a mesma confirmação não concede duas vezes; nulo
   * na compensação por indisponibilidade).
   * Devolve o Período criado.
   */
  async grantPackage(
    tx: Transaction,
    accountId: string,
    days: number,
    paymentId: string | null,
    now = new Date(),
    options: GrantOptions = {},
  ): Promise<{ startsAt: Date; endsAt: Date }> {
    await this.lock(tx, accountId);
    const { purchase } = await this.write(tx, accountId, now, {
      plan: options.plan ?? 'capo',
      days,
      test: options.test ?? false,
      paymentId,
    });
    return { startsAt: purchase.startsAt, endsAt: purchase.endsAt };
  }

  /**
   * Tira do VIP dias de UM Pacote (reembolso ou contestação): encurta o Período dele em `days` (o
   * Pacote inteiro, se `days` não vier ou cobrir tudo, apaga) e recua pela mesma duração os Períodos
   * que vêm depois, então a data de fim recua exatamente esses dias, mesmo que parte já tenha sido
   * usada. Sem Período (já removido, ou a Staff nunca concedeu): `false`.
   */
  async removePackage(tx: Transaction, paymentId: string, days?: number): Promise<boolean> {
    const [period] = await tx
      .select()
      .from(vipPeriods)
      .where(eq(vipPeriods.paymentId, paymentId))
      .for('update');
    if (!period) return false;
    await this.lock(tx, period.accountId);
    const duration = period.endsAt.getTime() - period.startsAt.getTime();
    const removed = days === undefined ? duration : Math.min(days * DAY_MS, duration);
    if (removed <= 0) return false;
    if (removed >= duration) {
      await tx.delete(vipPeriods).where(eq(vipPeriods.id, period.id));
    } else {
      await tx
        .update(vipPeriods)
        .set({ endsAt: new Date(period.endsAt.getTime() - removed) })
        .where(eq(vipPeriods.id, period.id));
    }
    const shift = sql`make_interval(secs => ${removed / 1000})`;
    await tx
      .update(vipPeriods)
      .set({
        startsAt: sql`${vipPeriods.startsAt} - ${shift}`,
        endsAt: sql`${vipPeriods.endsAt} - ${shift}`,
      })
      .where(
        and(eq(vipPeriods.accountId, period.accountId), gte(vipPeriods.startsAt, period.endsAt)),
      );
    return true;
  }

  /**
   * Revoga o VIP agora: o Período em curso acaba em `now` e os encadeados depois dele somem.
   * Registra no log de auditoria. Sem VIP ativo, {@link NoVipToRevoke}.
   */
  async revoke(accountId: string, staff: StaffAction, now = new Date()): Promise<VipStatusAt> {
    await this.db.transaction(async (tx) => {
      const steamId = await this.lock(tx, accountId);
      const before = await this.activeStatus(tx, accountId, now);
      if (!before.active) throw new NoVipToRevoke();
      const ongoing = and(eq(vipPeriods.accountId, accountId), gt(vipPeriods.endsAt, now));
      // Os que ainda não começaram somem; os em curso acabam agora.
      await tx.delete(vipPeriods).where(and(ongoing, gt(vipPeriods.startsAt, now)));
      await tx.delete(vipPeriods).where(and(ongoing, eq(vipPeriods.startsAt, now)));
      await tx
        .update(vipPeriods)
        .set({ endsAt: now })
        .where(and(ongoing, lte(vipPeriods.startsAt, now)));
      // Registro da revogação (S20, ADR 0026): mesmo instante e motivo da linha do log de auditoria. Os Períodos
      // também foram encurtados acima, então a imagem antiga, que não conhece esta tabela, vê o mesmo resultado.
      await tx.insert(planRevocations).values({
        accountId,
        revokedAt: now,
        revokedBySteamId: BigInt(staff.actorSteamId),
        reason: staff.reason,
      });
      await this.audit(tx, 'vip_revoke', accountId, steamId, staff, now, {
        endsAtBefore: before.endsAt?.toISOString() ?? null,
        plan: before.plan,
      });
    });
    return this.statusOf(accountId, now);
  }

  /** As ações da Staff sobre a Conta, da mais recente para a mais antiga. */
  async auditOf(accountId: string, limit = 10): Promise<StaffAuditEntry[]> {
    const rows = await this.db
      .select()
      .from(staffAuditLog)
      .where(eq(staffAuditLog.targetAccountId, accountId))
      .orderBy(desc(staffAuditLog.createdAt), desc(staffAuditLog.id))
      .limit(limit);
    return rows.map((row) => ({
      actorSteamId: row.actorSteamId.toString(),
      action: row.action,
      targetSteamId: row.targetSteamId?.toString() ?? null,
      reason: row.reason,
      details: row.details,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Serializa as mudanças de VIP da Conta: duas concessões simultâneas não começam no mesmo
   * instante. Devolve o SteamID64 dela.
   */
  private async lock(tx: Transaction, accountId: string): Promise<bigint> {
    const [account] = await tx
      .select({ steamId: accounts.steamId })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for('update');
    if (!account) throw new Error(`Conta ${accountId} não existe`);
    return account.steamId;
  }

  private async activeStatus(tx: Transaction, accountId: string, now: Date) {
    const periods = await tx
      .select({
        startsAt: vipPeriods.startsAt,
        endsAt: vipPeriods.endsAt,
        plan: vipPeriods.plan,
        test: vipPeriods.test,
      })
      .from(vipPeriods)
      .where(and(eq(vipPeriods.accountId, accountId), gt(vipPeriods.endsAt, now)));
    return toVip(planStatusOfPeriods(periods, now));
  }

  /**
   * Grava um pacote pela regra dos planos ({@link planPurchase}): corta o Capo em curso, empurra a fila, insere o
   * pacote (com o pagamento) e o Capo que ficou guardado. Devolve o Período do pacote.
   */
  private async write(
    tx: Transaction,
    accountId: string,
    now: Date,
    purchase: { plan: Plan; days: number; test: boolean; paymentId: string | null },
  ): Promise<{ purchase: { startsAt: Date; endsAt: Date } }> {
    const rows = await tx
      .select({
        id: vipPeriods.id,
        startsAt: vipPeriods.startsAt,
        endsAt: vipPeriods.endsAt,
        plan: vipPeriods.plan,
        test: vipPeriods.test,
      })
      .from(vipPeriods)
      .where(and(eq(vipPeriods.accountId, accountId), gt(vipPeriods.endsAt, now)));
    const writes: PurchaseWrites = planPurchase(rows, now, purchase);
    for (const { id, endsAt } of writes.truncate) {
      await tx.update(vipPeriods).set({ endsAt }).where(eq(vipPeriods.id, id));
    }
    for (const id of writes.remove) await tx.delete(vipPeriods).where(eq(vipPeriods.id, id));
    for (const { id, byMs } of writes.shift) {
      const by = sql`make_interval(secs => ${byMs / 1000})`;
      await tx
        .update(vipPeriods)
        .set({
          startsAt: sql`${vipPeriods.startsAt} + ${by}`,
          endsAt: sql`${vipPeriods.endsAt} + ${by}`,
        })
        .where(eq(vipPeriods.id, id));
    }
    let bought: { startsAt: Date; endsAt: Date } | null = null;
    for (const period of writes.insert) {
      const isPurchase = period.role === 'purchase';
      await tx.insert(vipPeriods).values({
        accountId,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        plan: period.plan,
        test: period.test,
        paymentId: isPurchase ? purchase.paymentId : null,
      });
      if (isPurchase) bought = { startsAt: period.startsAt, endsAt: period.endsAt };
    }
    return { purchase: bought as { startsAt: Date; endsAt: Date } };
  }

  private async audit(
    tx: Transaction,
    action: 'vip_grant' | 'vip_revoke',
    accountId: string,
    steamId: bigint,
    staff: StaffAction,
    now: Date,
    details: Record<string, unknown>,
  ): Promise<void> {
    await recordStaffAudit(tx, {
      action,
      staff,
      target: { accountId, steamId },
      details,
      at: now,
    });
  }
}
