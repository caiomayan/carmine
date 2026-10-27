import { and, eq, gt, lte, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { staffAuditLog, vipPeriods } from '../database/schema.js';
import type { StaffAction } from '../staff/audit-log.js';
import type { VipPeriods } from './vip-periods.js';

/** Esta compensação (a chave) já foi aplicada: não se aplica duas vezes. */
export class CompensationAlreadyApplied extends Error {
  constructor(key: string) {
    super(`a compensação "${key}" já foi aplicada`);
    this.name = 'CompensationAlreadyApplied';
  }
}

export interface CompensationResult {
  accounts: number;
  days: number;
}

/**
 * Compensação por indisponibilidade (S14, D4): quando os Servidores Carmine ou os benefícios do VIP
 * ficam fora por mais de 24 h, a Staff devolve os dias a todos os VIPs ativos de uma vez. É uma ação
 * da Staff, não automática (o sistema não distingue "servidor caiu" de "o benefício não chegou"), e
 * idempotente pela `key`: repetir o comando com a mesma chave não soma de novo. Tudo numa transação,
 * com UMA linha no log de auditoria.
 */
export class VipCompensation {
  constructor(
    private readonly db: Database,
    private readonly vip: VipPeriods,
    private readonly alert?: (message: string) => Promise<unknown>,
  ) {}

  async run(
    input: { days: number; key: string },
    staff: StaffAction,
    now = new Date(),
  ): Promise<CompensationResult> {
    const result = await this.db.transaction(async (tx) => {
      // Duas execuções ao mesmo tempo com a mesma chave: uma espera a outra.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`vip-compensation:${input.key}`}))`,
      );
      const [done] = await tx
        .select({ id: staffAuditLog.id })
        .from(staffAuditLog)
        .where(
          and(
            eq(staffAuditLog.action, 'vip_compensation'),
            sql`${staffAuditLog.details}->>'key' = ${input.key}`,
          ),
        )
        .limit(1);
      if (done) throw new CompensationAlreadyApplied(input.key);

      const active = await tx
        .selectDistinct({ accountId: vipPeriods.accountId })
        .from(vipPeriods)
        .where(and(lte(vipPeriods.startsAt, now), gt(vipPeriods.endsAt, now)));
      for (const { accountId } of active) {
        await this.vip.grantPackage(tx, accountId, input.days, null, now);
      }
      await tx.insert(staffAuditLog).values({
        actorSteamId: BigInt(staff.actorSteamId),
        action: 'vip_compensation',
        reason: staff.reason,
        details: { key: input.key, days: input.days, accounts: active.length },
        createdAt: now,
      });
      return { accounts: active.length, days: input.days };
    });
    await this.alert?.(
      `Compensação de ${result.days} dia(s) de VIP por indisponibilidade aplicada a ${result.accounts} Conta(s) (${input.key}).`,
    )?.catch?.(() => undefined);
    return result;
  }
}
