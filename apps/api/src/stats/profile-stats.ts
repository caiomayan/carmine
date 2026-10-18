import type { GameMode, ProfileStats } from '@carmine/contracts';
import { eq, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { canSeeStats } from '../accounts/profile-privacy.js';
import type { Database } from '../database/database.js';
import { accountStatsWeekly } from '../database/schema.js';
import { type StatsTotals, toModeStats, toTotalStats } from './stats-formulas.js';

const MODE_ORDER: GameMode[] = ['retake', 'deathmatch'];

/** As Estatísticas de sempre de uma Conta (S12): as semanas somadas, por Modo e no total. */
export class ProfileStatsReader {
  constructor(private readonly db: Database) {}

  /**
   * Respeita o Perfil privado (S11) por `canSeeStats`: para quem não pode ver, `visible` é falso e
   * não há números. Modos sem nenhum evento não aparecem.
   */
  async read(
    account: { id: string; profilePrivate: boolean },
    viewerAccountId: string | null,
  ): Promise<ProfileStats> {
    if (!canSeeStats(account, viewerAccountId)) {
      return { visible: false, total: null, modes: [] };
    }
    const sum = (column: AnyPgColumn) => sql<number>`coalesce(sum(${column}), 0)::float8`;
    const rows = await this.db
      .select({
        mode: accountStatsWeekly.mode,
        kills: sum(accountStatsWeekly.kills),
        deaths: sum(accountStatsWeekly.deaths),
        assists: sum(accountStatsWeekly.assists),
        headshots: sum(accountStatsWeekly.headshots),
        damage: sum(accountStatsWeekly.damage),
        roundsPlayed: sum(accountStatsWeekly.roundsPlayed),
        roundsWon: sum(accountStatsWeekly.roundsWon),
        secondsPlayed: sum(accountStatsWeekly.secondsPlayed),
      })
      .from(accountStatsWeekly)
      .where(eq(accountStatsWeekly.accountId, account.id))
      .groupBy(accountStatsWeekly.mode);

    const modes = [...rows].sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode));
    const total = modes.reduce<StatsTotals>(
      (acc, row) => ({
        kills: acc.kills + row.kills,
        deaths: acc.deaths + row.deaths,
        assists: acc.assists + row.assists,
        headshots: acc.headshots + row.headshots,
        damage: acc.damage + row.damage,
        roundsPlayed: acc.roundsPlayed + row.roundsPlayed,
        roundsWon: acc.roundsWon + row.roundsWon,
        secondsPlayed: acc.secondsPlayed + row.secondsPlayed,
      }),
      {
        kills: 0,
        deaths: 0,
        assists: 0,
        headshots: 0,
        damage: 0,
        roundsPlayed: 0,
        roundsWon: 0,
        secondsPlayed: 0,
      },
    );
    return {
      visible: true,
      total: toTotalStats(total),
      modes: modes.map((row) => toModeStats(row.mode, row)),
    };
  }
}
