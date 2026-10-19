import type { GameMode } from '@carmine/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountStatsWeekly, rankingRemovals } from '../database/schema.js';
import { recordStaffAudit, type StaffAction } from '../staff/audit-log.js';

/** A Conta não tem Estatísticas nesse Modo e semana: não há entrada a remover. */
export class RankingEntryNotFound extends Error {}

/** A entrada já foi removida. */
export class RankingEntryAlreadyRemoved extends Error {}

/**
 * Integridade do Ranking (S12): a Staff tira uma Conta de um Modo e semana. A remoção não apaga
 * as Estatísticas (o Perfil continua igual), vale também para semanas passadas e fica no log de
 * auditoria. O jogador contesta pelo Discord (a interface só orienta).
 */
export class RankingRemovals {
  constructor(
    private readonly db: Database,
    /** Tira o Ranking do cache; o CLI não tem Valkey e deixa o TTL curto resolver. */
    private readonly onRemoved: (
      mode: GameMode,
      weekStart: string,
    ) => Promise<void> = async () => {},
  ) {}

  async remove(
    target: { accountId: string; steamId: bigint | string },
    mode: GameMode,
    weekStart: string,
    staff: StaffAction,
    now = new Date(),
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [stats] = await tx
        .select({ roundsPlayed: accountStatsWeekly.roundsPlayed })
        .from(accountStatsWeekly)
        .where(
          and(
            eq(accountStatsWeekly.accountId, target.accountId),
            eq(accountStatsWeekly.mode, mode),
            eq(accountStatsWeekly.weekStart, weekStart),
          ),
        );
      if (!stats)
        throw new RankingEntryNotFound('A Conta não tem Estatísticas nesse Modo e semana');
      const inserted = await tx
        .insert(rankingRemovals)
        .values({
          accountId: target.accountId,
          mode,
          weekStart,
          removedBySteamId: BigInt(staff.actorSteamId),
          reason: staff.reason,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ accountId: rankingRemovals.accountId });
      if (inserted.length === 0) {
        throw new RankingEntryAlreadyRemoved('A entrada já foi removida do Ranking');
      }
      await recordStaffAudit(tx, {
        action: 'ranking_entry_remove',
        staff,
        target,
        details: { mode, weekStart },
        at: now,
      });
    });
    await this.onRemoved(mode, weekStart);
  }
}
