import {
  type GameMode,
  type ModeRating,
  type OverallRating,
  RATING_MIN_ROUNDS,
  RATING_MODES,
  RATING_WINDOW_DAYS,
  type RatingMode,
} from '@carmine/contracts';
import type { Database } from '../database/database.js';
import {
  computeOverall,
  computeRating,
  displayRating,
  emptyRatingCounts,
  type RatingComputation,
} from './rating.js';
import {
  bySide,
  loadLifetimeRounds,
  loadRatingCounts,
  type RatingWindow,
  windowEndingNow,
} from './rating-counts.js';
import type { RatingPopulations } from './rating-populations.js';

/** O Rating como a API o devolve (2 casas, sem os detalhes da conta). */
export function toModeRating(result: RatingComputation): ModeRating {
  switch (result.status) {
    case 'rated':
      return { status: 'rated', rating: displayRating(result.rating), rounds: result.rounds };
    case 'calibrating':
      return { status: 'calibrating', rounds: result.rounds, required: RATING_MIN_ROUNDS };
    default:
      return { status: result.status };
  }
}

/**
 * Lê o Rating Carmine (S21, ADR 0029) de Contas: as contagens da janela e os rounds de toda a vida
 * vêm de `account_rating_daily`, a população da semana vem de `rating_population`, e a conta é a
 * calculadora pura (`rating.ts`). O Perfil usa os 90 dias; o Ranking de Retake (P4) passa a semana.
 */
export class RatingReader {
  constructor(
    private readonly db: Database,
    private readonly populations: Pick<RatingPopulations, 'latest'>,
  ) {}

  /** O Rating de cada Conta no Modo, na janela dada; toda Conta pedida volta, mesmo sem rounds. */
  async compute(
    mode: RatingMode,
    accountIds: readonly string[],
    window: RatingWindow,
  ): Promise<Map<string, RatingComputation>> {
    const out = new Map<string, RatingComputation>();
    if (accountIds.length === 0) return out;
    const gameMode: GameMode = mode;
    const [population, lifetime, rows] = await Promise.all([
      this.populations.latest(mode),
      loadLifetimeRounds(this.db, gameMode, accountIds),
      loadRatingCounts(this.db, { mode: gameMode, window, accountIds }),
    ]);
    const sides = bySide(rows);
    for (const id of accountIds) {
      out.set(
        id,
        computeRating(
          lifetime.get(id) ?? 0,
          sides.get(id) ?? { ct: emptyRatingCounts(), t: emptyRatingCounts() },
          population,
        ),
      );
    }
    return out;
  }

  /** O Rating do Modo de uma Conta nos últimos 90 dias (o número de destaque do Perfil). */
  async profileRating(accountId: string, mode: RatingMode, now = new Date()): Promise<ModeRating> {
    const window = windowEndingNow(now, RATING_WINDOW_DAYS);
    const result = (await this.compute(mode, [accountId], window)).get(accountId);
    return toModeRating(result ?? { status: 'calibrating', rounds: 0 });
  }

  /** O Rating de cada Modo e o geral de uma Conta nos últimos 90 dias. */
  async profileRatings(
    accountId: string,
    now = new Date(),
  ): Promise<{ modes: Record<RatingMode, ModeRating>; overall: OverallRating | null }> {
    const window = windowEndingNow(now, RATING_WINDOW_DAYS);
    const computed: RatingComputation[] = [];
    const modes = {} as Record<RatingMode, ModeRating>;
    for (const mode of RATING_MODES) {
      const result = (await this.compute(mode, [accountId], window)).get(accountId) ?? {
        status: 'calibrating' as const,
        rounds: 0,
      };
      computed.push(result);
      modes[mode] = toModeRating(result);
    }
    const overall = computeOverall(computed);
    return {
      modes,
      overall: overall && { rating: displayRating(overall.rating), rounds: overall.rounds },
    };
  }
}
