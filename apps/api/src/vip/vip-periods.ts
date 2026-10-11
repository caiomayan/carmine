import { and, eq, gt } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, vipPeriods } from '../database/schema.js';
import { type VipStatusAt, vipStatusAt } from './vip-status.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Períodos VIP das Contas. Na S04, o site só lê; `grant` existe para o CLI de operação e
 * testes (`vip.cli.ts`). A concessão pela Staff, com auditoria, vem na S05 e os Pacotes VIP,
 * na S14.
 */
export class VipPeriods {
  constructor(private readonly db: Database) {}

  /** O VIP da Conta agora: ativo e até quando, somando os Períodos encadeados. */
  async statusOf(accountId: string, now = new Date()): Promise<VipStatusAt> {
    const periods = await this.db
      .select({ startsAt: vipPeriods.startsAt, endsAt: vipPeriods.endsAt })
      .from(vipPeriods)
      .where(and(eq(vipPeriods.accountId, accountId), gt(vipPeriods.endsAt, now)));
    return vipStatusAt(periods, now);
  }

  /**
   * Concede `days` dias de VIP a partir de agora ou, com VIP ativo, a partir do fim dele (os
   * dias se somam, como os Pacotes VIP). Devolve o VIP resultante.
   */
  async grant(accountId: string, days: number, now = new Date()): Promise<VipStatusAt> {
    await this.db.transaction(async (tx) => {
      // Duas concessões simultâneas para a mesma Conta não começam no mesmo instante.
      await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      const periods = await tx
        .select({ startsAt: vipPeriods.startsAt, endsAt: vipPeriods.endsAt })
        .from(vipPeriods)
        .where(and(eq(vipPeriods.accountId, accountId), gt(vipPeriods.endsAt, now)));
      const startsAt = vipStatusAt(periods, now).endsAt ?? now;
      await tx.insert(vipPeriods).values({
        accountId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + days * DAY_MS),
      });
    });
    return this.statusOf(accountId, now);
  }
}
