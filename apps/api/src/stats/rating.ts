import { RATING_MIN_ROUNDS } from '@carmine/contracts';

/**
 * O Rating Carmine v1 (S21, ADR 0029): a calculadora pura, sem banco. Recebe as contagens de uma
 * Conta num Modo (por lado, na janela) e a população do Modo e devolve o Rating. Quem lê o banco e
 * escolhe a janela é o `RatingReader`; quem monta a população é o `RatingPopulations`.
 *
 * Mudar qualquer número daqui é uma versão nova da fórmula: suba {@link RATING_FORMULA_VERSION}.
 */

export const RATING_FORMULA_VERSION = 1;

/** Quanto vale 1 desvio da média das 5 partes: uma Conta 1 desvio acima em tudo tem 1,20. */
export const RATING_SPREAD = 0.2;

/** Nenhuma parte passa de tantos desvios para cima nem para baixo. */
export const RATING_Z_CLIP = 3;

/** Um desvio menor que isto é zero: ruído de ponto flutuante não pode virar divisão por quase nada. */
export const RATING_SD_EPSILON = 1e-9;

/** Amostra pequena: o Rating é puxado para 1,00 por `n / (n + RATING_PULL_K)`, `n` em rounds. */
export const RATING_PULL_K = 50;

/** Contas elegíveis que a população de um Modo e lado precisa ter; abaixo disso não há Rating. */
export const RATING_POPULATION_MIN_ACCOUNTS = 20;

/** Os pontos de Impacto (por round) de cada coisa que um jogador faz; ADR 0029. */
export const IMPACT_POINTS = {
  openingKill: 1,
  openingDeath: -0.5,
  multiKill: [0.5, 1.5, 3, 5],
  clutchWon: [1, 2, 3.5, 5, 7],
} as const;

/** As contagens de uma Conta num Modo e lado, numa janela: tudo o que o Rating lê. */
export interface RatingCounts {
  rounds: number;
  kills: number;
  survivedRounds: number;
  kastRounds: number;
  damage: number;
  openingKills: number;
  openingDeaths: number;
  /** Rounds com 2, 3, 4 e 5 abates. */
  mk2: number;
  mk3: number;
  mk4: number;
  mk5: number;
  /** Clutches vencidos contra 1, 2, 3, 4 e 5 ou mais inimigos. */
  cw1: number;
  cw2: number;
  cw3: number;
  cw4: number;
  cw5: number;
}

export type RatingSide = 'ct' | 't';

export const RATING_PARTS = ['kills', 'survival', 'kast', 'damage', 'impact'] as const;
export type RatingPart = (typeof RATING_PARTS)[number];
export type PartValues = Record<RatingPart, number>;

export const emptyRatingCounts = (): RatingCounts => ({
  rounds: 0,
  kills: 0,
  survivedRounds: 0,
  kastRounds: 0,
  damage: 0,
  openingKills: 0,
  openingDeaths: 0,
  mk2: 0,
  mk3: 0,
  mk4: 0,
  mk5: 0,
  cw1: 0,
  cw2: 0,
  cw3: 0,
  cw4: 0,
  cw5: 0,
});

/** Soma duas contagens (os dias de uma janela, ou os mapas de um dia). */
export function addRatingCounts(a: RatingCounts, b: RatingCounts): RatingCounts {
  const out = { ...a };
  for (const key of Object.keys(b) as (keyof RatingCounts)[]) out[key] += b[key];
  return out;
}

/** Os pontos de Impacto somados das contagens. */
export function impactPoints(c: RatingCounts): number {
  const multi = [c.mk2, c.mk3, c.mk4, c.mk5];
  const clutch = [c.cw1, c.cw2, c.cw3, c.cw4, c.cw5];
  let points =
    c.openingKills * IMPACT_POINTS.openingKill + c.openingDeaths * IMPACT_POINTS.openingDeath;
  for (const [i, n] of multi.entries()) points += n * (IMPACT_POINTS.multiKill[i] ?? 0);
  for (const [i, n] of clutch.entries()) points += n * (IMPACT_POINTS.clutchWon[i] ?? 0);
  return points;
}

/** As 5 partes de um lado, por round. Pede `rounds > 0`. */
export function ratingParts(c: RatingCounts): PartValues {
  const per = (total: number) => total / c.rounds;
  return {
    kills: per(c.kills),
    survival: per(c.survivedRounds),
    kast: per(c.kastRounds),
    damage: per(c.damage),
    impact: per(impactPoints(c)),
  };
}

/** A média e o desvio de cada parte entre as Contas elegíveis de um Modo e lado. */
export interface SidePopulation {
  accounts: number;
  mean: PartValues;
  sd: PartValues;
}

/**
 * A população de um Modo e lado: as Contas com {@link RATING_MIN_ROUNDS} rounds ou mais naquele
 * lado, cada uma pesando igual. Devolve `null` com menos de {@link RATING_POPULATION_MIN_ACCOUNTS}
 * Contas. O desvio é o da população (divisor N).
 */
export function buildSidePopulation(sides: readonly RatingCounts[]): SidePopulation | null {
  const rates = sides.filter((s) => s.rounds >= RATING_MIN_ROUNDS).map(ratingParts);
  if (rates.length < RATING_POPULATION_MIN_ACCOUNTS) return null;
  const mean = {} as PartValues;
  const sd = {} as PartValues;
  for (const part of RATING_PARTS) {
    const values = rates.map((r) => r[part]);
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    mean[part] = avg;
    sd[part] = Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length);
  }
  return { accounts: rates.length, mean, sd };
}

export type RatingPopulation = Record<RatingSide, SidePopulation | null>;

/** O que a calculadora conclui de uma Conta num Modo (os estados do ADR 0029). */
export type RatingComputation =
  | { status: 'calibrating'; rounds: number }
  | { status: 'no_rounds' }
  | { status: 'no_population' }
  | {
      status: 'rated';
      /** Rounds da janela. */
      rounds: number;
      /** O Rating do lado, só dos lados jogados. */
      sides: Partial<Record<RatingSide, number>>;
      /** Média dos lados pesada pelos rounds, antes do puxão. */
      raw: number;
      /** Depois do puxão, sem arredondar. */
      rating: number;
    };

const SIDES: readonly RatingSide[] = ['ct', 't'];

/** O Rating de um lado: `1 + SPREAD × média dos z` das 5 partes. */
function sideRating(counts: RatingCounts, population: SidePopulation): number {
  const parts = ratingParts(counts);
  let total = 0;
  for (const part of RATING_PARTS) {
    const sd = population.sd[part];
    const z = sd < RATING_SD_EPSILON ? 0 : (parts[part] - population.mean[part]) / sd;
    total += Math.max(-RATING_Z_CLIP, Math.min(RATING_Z_CLIP, z));
  }
  return 1 + RATING_SPREAD * (total / RATING_PARTS.length);
}

/**
 * O Rating de uma Conta num Modo. `lifetimeRounds` são os rounds no Modo desde o início da coleta
 * (a regra do Calibrando); `window` são as contagens da janela (90 dias no Perfil, a semana no
 * Ranking), por lado.
 */
export function computeRating(
  lifetimeRounds: number,
  window: Record<RatingSide, RatingCounts>,
  population: RatingPopulation,
): RatingComputation {
  if (lifetimeRounds < RATING_MIN_ROUNDS) return { status: 'calibrating', rounds: lifetimeRounds };
  const rounds = window.ct.rounds + window.t.rounds;
  if (rounds === 0) return { status: 'no_rounds' };

  const sides: Partial<Record<RatingSide, number>> = {};
  let weighted = 0;
  for (const side of SIDES) {
    if (window[side].rounds === 0) continue;
    const pop = population[side];
    if (pop === null) return { status: 'no_population' };
    const value = sideRating(window[side], pop);
    sides[side] = value;
    weighted += value * window[side].rounds;
  }
  const raw = weighted / rounds;
  return {
    status: 'rated',
    rounds,
    sides,
    raw,
    rating: 1 + (raw - 1) * (rounds / (rounds + RATING_PULL_K)),
  };
}

/** O Rating como aparece: 2 casas. O Ranking ordena por este valor, já arredondado. */
export const displayRating = (rating: number): number => Number(rating.toFixed(2));

/** O Rating geral: a média dos Modos que aparecem, pesada pelos rounds da janela; `null` sem nenhum. */
export function computeOverall(
  modes: readonly RatingComputation[],
): { rating: number; rounds: number } | null {
  let rounds = 0;
  let weighted = 0;
  for (const mode of modes) {
    if (mode.status !== 'rated') continue;
    rounds += mode.rounds;
    weighted += mode.rating * mode.rounds;
  }
  return rounds === 0 ? null : { rating: weighted / rounds, rounds };
}
