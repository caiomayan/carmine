import type { WeekSummary, WeekTotals } from '@carmine/contracts';
import { inArray, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountStatsWeekly } from '../database/schema.js';
import { weekEndOf, weekStartOf } from './stats-week.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A segunda-feira da semana anterior a `weekStart`. */
function previousWeek(weekStart: string): string {
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) - 7 * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Os números da semana de todas as Contas somados (a faixa "Esta semana" da home). Lê só
 * `account_stats_weekly`, a mesma fonte do Ranking e do Perfil: duas semanas, uma linha por Conta e
 * Modo cada, então uma consulta agregada basta. O resultado fica `cacheMs` na memória (a home pede a
 * cada visita e o número só se mexe com os lotes de eventos); 0 desliga.
 */
export class WeekSummaryReader {
  private cached: { at: number; value: WeekSummary } | null = null;

  constructor(
    private readonly db: Database,
    private readonly options: { cacheMs?: number; now?: () => Date } = {},
  ) {}

  async read(): Promise<WeekSummary> {
    const now = this.options.now?.() ?? new Date();
    const cacheMs = this.options.cacheMs ?? 0;
    if (this.cached && now.getTime() - this.cached.at < cacheMs) return this.cached.value;

    const weekStart = weekStartOf(now);
    const previous = previousWeek(weekStart);
    const t = accountStatsWeekly;
    const rows = await this.db
      .select({
        weekStart: t.weekStart,
        players: sql<number>`count(distinct ${t.accountId})`.mapWith(Number),
        kills: sql<number>`coalesce(sum(${t.kills}), 0)`.mapWith(Number),
        headshots: sql<number>`coalesce(sum(${t.headshots}), 0)`.mapWith(Number),
        secondsPlayed: sql<number>`coalesce(sum(${t.secondsPlayed}), 0)`.mapWith(Number),
      })
      .from(t)
      .where(inArray(t.weekStart, [weekStart, previous]))
      .groupBy(t.weekStart);

    const totalsOf = (week: string): WeekTotals | null => {
      const row = rows.find((r) => r.weekStart === week);
      return row
        ? {
            players: row.players,
            kills: row.kills,
            headshots: row.headshots,
            secondsPlayed: row.secondsPlayed,
          }
        : null;
    };
    const value: WeekSummary = {
      weekStart,
      weekEnd: weekEndOf(weekStart),
      current: totalsOf(weekStart) ?? { players: 0, kills: 0, headshots: 0, secondsPlayed: 0 },
      previous: totalsOf(previous),
    };
    this.cached = { at: now.getTime(), value };
    return value;
  }
}
