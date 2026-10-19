import {
  DEATHMATCH_MIN_MINUTES,
  type GameMode,
  RANKING_SIZE,
  RANKING_WEEKS_LISTED,
  type Ranking,
  type RankingEntry,
  type RankingPlayer,
  type RankingViewer,
  RETAKE_MIN_ROUNDS,
} from '@carmine/contracts';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { type RankingIdentity, rankingIdentity } from '../accounts/profile-privacy.js';
import type { Database } from '../database/database.js';
import { accountStatsWeekly, accounts, rankingRemovals } from '../database/schema.js';
import { DEATHMATCH_MIN_SECONDS, progressToMinimum, type RankedRow, rankWeek } from './ranking.js';
import type { RankingCache } from './ranking-cache.js';
import { parseWeekStart, weekEndOf, weekStartOf } from './stats-week.js';

/** A semana pedida não é uma segunda-feira válida, ou ainda não começou. */
export class InvalidRankingWeek extends Error {}

const statColumns = {
  kills: accountStatsWeekly.kills,
  deaths: accountStatsWeekly.deaths,
  assists: accountStatsWeekly.assists,
  headshots: accountStatsWeekly.headshots,
  damage: accountStatsWeekly.damage,
  roundsPlayed: accountStatsWeekly.roundsPlayed,
  roundsWon: accountStatsWeekly.roundsWon,
  secondsPlayed: accountStatsWeekly.secondsPlayed,
};

/**
 * O Ranking semanal por Modo (S12): lê a semana de `account_stats_weekly`, tira quem a Staff
 * removeu e as Contas anonimizadas, ordena por {@link rankWeek} e corta no top 50. A ordem
 * inteira fica no cache curto; a identidade (`rankingIdentity`) e a parte de quem pede são
 * sempre lidas na hora.
 */
export class WeeklyRanking {
  constructor(
    private readonly db: Database,
    private readonly cache: RankingCache | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(
    mode: GameMode,
    week: string | undefined,
    viewerAccountId: string | null,
  ): Promise<Ranking> {
    const currentWeek = weekStartOf(this.now());
    const weekStart = week === undefined ? currentWeek : parseWeekStart(week);
    if (weekStart === null || weekStart > currentWeek) {
      throw new InvalidRankingWeek('Semana inválida: use a segunda-feira (YYYY-MM-DD)');
    }
    const { ranked, weeks } = await this.ordered(mode, weekStart, currentWeek);
    const top = ranked.slice(0, RANKING_SIZE);
    const identities = await this.identities(top.map((row) => row.accountId));
    const entries = top.flatMap((row) => {
      const identity = identities.get(row.accountId);
      return identity ? [toEntry(row, identity, row.accountId === viewerAccountId)] : [];
    });
    return {
      mode,
      weekStart,
      weekEnd: weekEndOf(weekStart),
      current: weekStart === currentWeek,
      minimum:
        mode === 'retake'
          ? { unit: 'rounds', value: RETAKE_MIN_ROUNDS }
          : { unit: 'minutes', value: DEATHMATCH_MIN_MINUTES },
      entries,
      weeks,
      viewer:
        viewerAccountId === null
          ? null
          : await this.viewerPart(mode, weekStart, viewerAccountId, ranked),
    };
  }

  private async ordered(mode: GameMode, weekStart: string, currentWeek: string) {
    const cached = await this.cache?.get(mode, weekStart);
    if (cached) return cached;
    const [ranked, weeks] = await Promise.all([
      this.rankedWeek(mode, weekStart),
      this.weeksOf(mode, currentWeek),
    ]);
    const fresh = { ranked, weeks };
    await this.cache?.set(mode, weekStart, fresh);
    return fresh;
  }

  private async rankedWeek(mode: GameMode, weekStart: string): Promise<RankedRow[]> {
    const eligible =
      mode === 'retake'
        ? sql`${accountStatsWeekly.roundsPlayed} >= ${RETAKE_MIN_ROUNDS}`
        : sql`${accountStatsWeekly.secondsPlayed} >= ${DEATHMATCH_MIN_SECONDS}`;
    const rows = await this.db
      .select({
        accountId: accountStatsWeekly.accountId,
        publicId: accounts.publicId,
        ...statColumns,
      })
      .from(accountStatsWeekly)
      .innerJoin(accounts, eq(accounts.id, accountStatsWeekly.accountId))
      .leftJoin(
        rankingRemovals,
        and(
          eq(rankingRemovals.accountId, accountStatsWeekly.accountId),
          eq(rankingRemovals.mode, accountStatsWeekly.mode),
          eq(rankingRemovals.weekStart, accountStatsWeekly.weekStart),
        ),
      )
      .where(
        and(
          eq(accountStatsWeekly.mode, mode),
          eq(accountStatsWeekly.weekStart, weekStart),
          isNull(rankingRemovals.accountId),
          isNull(accounts.anonymizedAt),
          eligible,
        ),
      );
    return rankWeek(mode, rows);
  }

  /** A semana atual e as anteriores com atividade neste Modo, da mais recente à mais antiga. */
  private async weeksOf(mode: GameMode, currentWeek: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ weekStart: accountStatsWeekly.weekStart })
      .from(accountStatsWeekly)
      .where(eq(accountStatsWeekly.mode, mode))
      .orderBy(desc(accountStatsWeekly.weekStart))
      .limit(RANKING_WEEKS_LISTED);
    const weeks = new Set([currentWeek, ...rows.map((row) => row.weekStart)]);
    return [...weeks].sort().reverse().slice(0, RANKING_WEEKS_LISTED);
  }

  private async identities(accountIds: string[]): Promise<Map<string, RankingPlayer>> {
    if (accountIds.length === 0) return new Map();
    const rows = await this.db
      .select({
        id: accounts.id,
        publicId: accounts.publicId,
        displayName: accounts.displayName,
        avatarUrl: accounts.avatarUrl,
        profilePrivate: accounts.profilePrivate,
      })
      .from(accounts)
      .where(inArray(accounts.id, accountIds));
    return new Map(rows.map((row) => [row.id, toPlayer(rankingIdentity(row))]));
  }

  /** A própria posição (mesmo fora do top 50) ou quanto falta para o mínimo. */
  private async viewerPart(
    mode: GameMode,
    weekStart: string,
    accountId: string,
    ranked: RankedRow[],
  ): Promise<RankingViewer> {
    const own = ranked.find((row) => row.accountId === accountId);
    if (own) {
      const identity = (await this.identities([accountId])).get(accountId);
      return {
        entry: identity ? toEntry(own, identity, true) : null,
        progress: null,
        removed: false,
      };
    }
    const [stats] = await this.db
      .select(statColumns)
      .from(accountStatsWeekly)
      .where(
        and(
          eq(accountStatsWeekly.accountId, accountId),
          eq(accountStatsWeekly.mode, mode),
          eq(accountStatsWeekly.weekStart, weekStart),
        ),
      );
    const [removal] = await this.db
      .select({ accountId: rankingRemovals.accountId })
      .from(rankingRemovals)
      .where(
        and(
          eq(rankingRemovals.accountId, accountId),
          eq(rankingRemovals.mode, mode),
          eq(rankingRemovals.weekStart, weekStart),
        ),
      );
    return {
      entry: null,
      progress: progressToMinimum(mode, stats ?? null),
      removed: removal !== undefined,
    };
  }
}

function toPlayer(identity: RankingIdentity): RankingPlayer {
  return identity.private
    ? { private: true, publicId: null, displayName: identity.displayName, avatarUrl: null }
    : identity;
}

function toEntry(row: RankedRow, player: RankingPlayer, self: boolean): RankingEntry {
  return {
    position: row.position,
    player,
    score: row.score,
    kd: row.kd,
    headshotPercent: row.headshotPercent,
    roundsPlayed: row.roundsPlayed,
    secondsPlayed: row.secondsPlayed,
    self,
  };
}
