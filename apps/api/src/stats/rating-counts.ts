import type { GameMode } from '@carmine/contracts';
import { sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import {
  addRatingCounts,
  emptyRatingCounts,
  type RatingCounts,
  type RatingSide,
} from './rating.js';
import { dayOf } from './stats-week.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Uma janela de dias de Brasília (`YYYY-MM-DD`), com os dois extremos dentro. */
export interface RatingWindow {
  from: string;
  to: string;
}

/** Os `days` dias que terminam em `end` (inclusive). */
export function windowEndingAt(end: string, days: number): RatingWindow {
  return {
    from: new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1) * DAY_MS).toISOString().slice(0, 10),
    to: end,
  };
}

/** O dia seguinte (`YYYY-MM-DD`). */
export const dayAfter = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);

/** O dia anterior (`YYYY-MM-DD`). */
export const dayBefore = (day: string): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

/** Os últimos `days` dias, contando o de `now`. */
export const windowEndingNow = (now: Date, days: number): RatingWindow =>
  windowEndingAt(dayOf(now), days);

/** As colunas de contagem de `account_rating_daily`, na ordem de {@link RatingCounts}. */
const COUNT_COLUMNS = [
  ['rounds', 'rounds'],
  ['kills', 'kills'],
  ['survivedRounds', 'survived_rounds'],
  ['kastRounds', 'kast_rounds'],
  ['damage', 'damage'],
  ['openingKills', 'opening_kills'],
  ['openingDeaths', 'opening_deaths'],
  ['mk2', 'mk2'],
  ['mk3', 'mk3'],
  ['mk4', 'mk4'],
  ['mk5', 'mk5'],
  ['cw1', 'cw1'],
  ['cw2', 'cw2'],
  ['cw3', 'cw3'],
  ['cw4', 'cw4'],
  ['cw5', 'cw5'],
] as const satisfies readonly (readonly [keyof RatingCounts, string])[];

const sumColumns = sql.join(
  COUNT_COLUMNS.map(
    ([key, column]) => sql`coalesce(sum(${sql.raw(column)}), 0)::int as ${sql.raw(key)}`,
  ),
  sql`, `,
);

type CountRow = { account_id: string; side: RatingSide } & Record<string, unknown>;

const toCounts = (row: CountRow): RatingCounts => {
  const counts = emptyRatingCounts();
  for (const [key] of COUNT_COLUMNS) counts[key] = Number(row[key] ?? 0);
  return counts;
};

/** As contagens de cada Conta num Modo e lado, somadas nos dias da janela (de todos os mapas). */
export async function loadRatingCounts(
  db: Database,
  query: { mode: GameMode; window: RatingWindow; accountIds?: readonly string[] },
): Promise<{ accountId: string; side: RatingSide; counts: RatingCounts }[]> {
  const only =
    query.accountIds === undefined
      ? sql``
      : sql`and account_id in (${sql.join(
          query.accountIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`;
  if (query.accountIds?.length === 0) return [];
  const { rows } = await db.execute<CountRow>(sql`
    select account_id, side, ${sumColumns}
    from account_rating_daily
    where mode = ${query.mode}
      and day between ${query.window.from}::date and ${query.window.to}::date
      ${only}
    group by account_id, side`);
  return rows.map((row) => ({ accountId: row.account_id, side: row.side, counts: toCounts(row) }));
}

/** Os rounds de cada Conta no Modo desde o início da coleta (a regra do Calibrando). */
export async function loadLifetimeRounds(
  db: Database,
  mode: GameMode,
  accountIds: readonly string[],
): Promise<Map<string, number>> {
  if (accountIds.length === 0) return new Map();
  const { rows } = await db.execute<{ account_id: string; rounds: number }>(sql`
    select account_id, sum(rounds)::int as rounds
    from account_rating_daily
    where mode = ${mode}
      and account_id in (${sql.join(
        accountIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
    group by account_id`);
  return new Map(rows.map((row) => [row.account_id, Number(row.rounds)]));
}

/** Junta as linhas por lado de cada Conta no par que a calculadora recebe. */
export function bySide(
  rows: readonly { accountId: string; side: RatingSide; counts: RatingCounts }[],
): Map<string, Record<RatingSide, RatingCounts>> {
  const out = new Map<string, Record<RatingSide, RatingCounts>>();
  for (const row of rows) {
    const entry = out.get(row.accountId) ?? { ct: emptyRatingCounts(), t: emptyRatingCounts() };
    entry[row.side] = addRatingCounts(entry[row.side], row.counts);
    out.set(row.accountId, entry);
  }
  return out;
}
