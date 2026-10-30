import type { GameMode } from '@carmine/contracts';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountStatsDaily, accountStatsWeekly, accounts } from '../database/schema.js';
import { firstConnectGreeting, type GreetingFacts, pickGreeting } from './curiosities.js';
import { weekEndOf, weekStartOf } from './stats-week.js';
import type { WeeklyRanking } from './weekly-ranking.js';

/**
 * A linha única do connect nos servidores abertos (S16): as boas-vindas da Conta nova no Modo ou uma
 * curiosidade da semana, já em português. Quem escolhe a frase é a API, então uma curiosidade nova não
 * pede release do plugin. A última curiosidade mostrada fica na Conta, para dois connects seguidos
 * não repetirem.
 */
export class Greetings {
  constructor(
    private readonly db: Database,
    private readonly ranking: WeeklyRanking,
    private readonly now: () => Date = () => new Date(),
    private readonly random: () => number = Math.random,
  ) {}

  async forConnect(
    accountId: string,
    displayName: string,
    mode: GameMode,
    isFirstConnect: boolean,
    awpHint: boolean,
  ): Promise<string> {
    if (isFirstConnect) return firstConnectGreeting(displayName, awpHint);
    const weekStart = weekStartOf(this.now());
    const [anyRow, week, days, total, last, ranking] = await Promise.all([
      this.db
        .select({ one: sql<number>`1` })
        .from(accountStatsWeekly)
        .where(and(eq(accountStatsWeekly.accountId, accountId), eq(accountStatsWeekly.mode, mode)))
        .limit(1),
      this.db
        .select()
        .from(accountStatsWeekly)
        .where(
          and(
            eq(accountStatsWeekly.accountId, accountId),
            eq(accountStatsWeekly.mode, mode),
            eq(accountStatsWeekly.weekStart, weekStart),
          ),
        ),
      this.db
        .select({
          day: accountStatsDaily.day,
          roundsWon: accountStatsDaily.roundsWon,
          kills: accountStatsDaily.kills,
          secondsPlayed: accountStatsDaily.secondsPlayed,
        })
        .from(accountStatsDaily)
        .where(
          and(
            eq(accountStatsDaily.accountId, accountId),
            eq(accountStatsDaily.mode, mode),
            gte(accountStatsDaily.day, weekStart),
            lte(accountStatsDaily.day, weekEndOf(weekStart)),
          ),
        ),
      this.db
        .select({
          seconds: sql<number>`coalesce(sum(${accountStatsWeekly.secondsPlayed}), 0)::float8`,
        })
        .from(accountStatsWeekly)
        .where(eq(accountStatsWeekly.accountId, accountId)),
      this.db
        .select({ lastCuriosity: accounts.lastCuriosity })
        .from(accounts)
        .where(eq(accounts.id, accountId)),
      this.ranking.read(mode, undefined, accountId),
    ]);

    const facts: GreetingFacts = {
      mode,
      displayName,
      hasStatsInMode: anyRow.length > 0,
      week: week[0] ?? null,
      viewer: ranking.viewer,
      days: days.filter((d) => d.secondsPlayed > 0 || d.roundsWon > 0 || d.kills > 0),
      totalSeconds: total[0]?.seconds ?? 0,
      awpHint,
    };
    const picked = pickGreeting(facts, last[0]?.lastCuriosity ?? null, this.random);
    if (picked.curiosityKey !== null) {
      await this.db
        .update(accounts)
        .set({ lastCuriosity: picked.curiosityKey })
        .where(eq(accounts.id, accountId));
    }
    return picked.line;
  }
}
