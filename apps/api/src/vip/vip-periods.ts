import { and, eq, gt } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { vipPeriods } from '../database/schema.js';
import { type VipStatusAt, vipStatusAt } from './vip-status.js';

/**
 * Períodos VIP das Contas. Só leitura na S04: a concessão pela Staff vem na S05 e os Pacotes
 * VIP, na S14.
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
}
