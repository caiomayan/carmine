import { and, desc, eq, gt, lte } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, staffAuditLog, vipPeriods } from '../database/schema.js';
import { type VipStatusAt, vipStatusAt } from './vip-status.js';

const DAY_MS = 24 * 60 * 60 * 1000;

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Quem da Staff fez e por quê: vai para o log de auditoria. */
export interface StaffAction {
  /** SteamID64 de quem fez. */
  actorSteamId: string;
  reason: string;
}

/** Uma linha do log de auditoria da Staff. */
export interface StaffAuditEntry {
  actorSteamId: string;
  action: 'vip_grant' | 'vip_revoke';
  targetSteamId: string;
  reason: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

/** Revogar uma Conta sem VIP ativo. */
export class NoVipToRevoke extends Error {
  constructor() {
    super('a Conta não tem VIP ativo');
    this.name = 'NoVipToRevoke';
  }
}

/**
 * Períodos VIP das Contas. A Staff concede e revoga (S05) com registro no log de auditoria;
 * `grant` sem `StaffAction` fica para os Pacotes VIP (S14) e os testes.
 */
export class VipPeriods {
  constructor(private readonly db: Database) {}

  /** O VIP da Conta agora: ativo e até quando, somando os Períodos encadeados. */
  async statusOf(accountId: string, now = new Date()): Promise<VipStatusAt> {
    // Todos os Períodos: os encerrados dão o `endedAt`. São poucos por Conta.
    const periods = await this.db
      .select({ startsAt: vipPeriods.startsAt, endsAt: vipPeriods.endsAt })
      .from(vipPeriods)
      .where(eq(vipPeriods.accountId, accountId));
    return vipStatusAt(periods, now);
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
  ): Promise<VipStatusAt> {
    await this.db.transaction(async (tx) => {
      const steamId = await this.lock(tx, accountId);
      const before = await this.activeStatus(tx, accountId, now);
      const startsAt = before.endsAt ?? now;
      const endsAt = new Date(startsAt.getTime() + days * DAY_MS);
      await tx.insert(vipPeriods).values({ accountId, startsAt, endsAt });
      if (staff) {
        await this.audit(tx, 'vip_grant', accountId, steamId, staff, now, {
          days,
          endsAtBefore: before.endsAt?.toISOString() ?? null,
          endsAtAfter: endsAt.toISOString(),
        });
      }
    });
    return this.statusOf(accountId, now);
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
      await this.audit(tx, 'vip_revoke', accountId, steamId, staff, now, {
        endsAtBefore: before.endsAt?.toISOString() ?? null,
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
      targetSteamId: row.targetSteamId.toString(),
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
      .select({ startsAt: vipPeriods.startsAt, endsAt: vipPeriods.endsAt })
      .from(vipPeriods)
      .where(and(eq(vipPeriods.accountId, accountId), gt(vipPeriods.endsAt, now)));
    return vipStatusAt(periods, now);
  }

  private async audit(
    tx: Transaction,
    action: StaffAuditEntry['action'],
    accountId: string,
    steamId: bigint,
    staff: StaffAction,
    now: Date,
    details: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(staffAuditLog).values({
      actorSteamId: BigInt(staff.actorSteamId),
      action,
      targetAccountId: accountId,
      targetSteamId: steamId,
      reason: staff.reason,
      details,
      createdAt: now,
    });
  }
}
