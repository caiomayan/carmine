/**
 * A fórmula v1 do Rating Carmine (ADR 0029) escrita do jeito mais direto possível, só para conferir
 * o código de produção: é o "oráculo" da planilha de conferência. Não é importada por `src/`, e a
 * calculadora de verdade (S21 P3) não pode reaproveitar nada daqui: ela escreve a própria e os
 * testes dela comparam com `expected.json`.
 */

export const RATING_FORMULA_VERSION = 1;

/** Rounds no Modo para o Rating aparecer (antes, `Calibrando n/100`) e para a Conta entrar na população. */
export const RATING_MIN_ROUNDS = 100;
/** Força do puxão para 1,00: `1 + (bruto − 1) · n / (n + k)`. */
export const RATING_PULL_K = 50;
/** Quanto uma média de 1 desvio acima da população vale no Rating (0,20 → 1,20). */
export const RATING_SPREAD = 0.2;
/** Nenhuma parte passa de 3 desvios para cima nem para baixo. */
export const RATING_Z_CLIP = 3;
/** Menos Contas elegíveis que isto no Modo e lado e a população não existe (sem Rating). */
export const POPULATION_MIN_ACCOUNTS = 20;

/** Os pontos de Impacto de cada coisa que um jogador faz num round. */
export const IMPACT_POINTS = {
  openingKill: 1.0,
  openingDeath: -0.5,
  multiKill: { 2: 0.5, 3: 1.5, 4: 3.0, 5: 5.0 },
  clutchWon: { 1: 1.0, 2: 2.0, 3: 3.5, 4: 5.0, 5: 7.0 },
} as const;

/** As contagens de uma Conta num Modo e lado, numa janela: tudo o que o Rating lê. */
export interface SideCounts {
  rounds: number;
  kills: number;
  survivedRounds: number;
  kastRounds: number;
  damage: number;
  openingKills: number;
  openingDeaths: number;
  mk2: number;
  mk3: number;
  mk4: number;
  mk5: number;
  cw1: number;
  cw2: number;
  cw3: number;
  cw4: number;
  cw5: number;
}

export const emptyCounts = (): SideCounts => ({
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

/** Uma linha de `round_player_summaries`, só com o que o Rating usa. */
export interface RoundRow {
  side: 'ct' | 't';
  kills: number;
  damage: number;
  survived: boolean;
  kast: boolean;
  openingKill: boolean;
  openingDeath: boolean;
  multiKill: number | null;
  clutchAgainst: number | null;
  clutchWon: boolean | null;
}

/** Soma os rounds de uma Conta em contagens por lado. */
export function aggregateRounds(rows: readonly RoundRow[]): { ct: SideCounts; t: SideCounts } {
  const out = { ct: emptyCounts(), t: emptyCounts() };
  for (const row of rows) {
    const c = out[row.side];
    c.rounds += 1;
    c.kills += row.kills;
    c.damage += row.damage;
    if (row.survived) c.survivedRounds += 1;
    if (row.kast) c.kastRounds += 1;
    if (row.openingKill) c.openingKills += 1;
    if (row.openingDeath) c.openingDeaths += 1;
    if (row.multiKill !== null) c[`mk${row.multiKill}` as 'mk2' | 'mk3' | 'mk4' | 'mk5'] += 1;
    if (row.clutchWon === true && row.clutchAgainst !== null) {
      c[`cw${Math.min(row.clutchAgainst, 5)}` as 'cw1' | 'cw2' | 'cw3' | 'cw4' | 'cw5'] += 1;
    }
  }
  return out;
}

export function impactPoints(c: SideCounts): number {
  return (
    c.openingKills * IMPACT_POINTS.openingKill +
    c.openingDeaths * IMPACT_POINTS.openingDeath +
    c.mk2 * IMPACT_POINTS.multiKill[2] +
    c.mk3 * IMPACT_POINTS.multiKill[3] +
    c.mk4 * IMPACT_POINTS.multiKill[4] +
    c.mk5 * IMPACT_POINTS.multiKill[5] +
    c.cw1 * IMPACT_POINTS.clutchWon[1] +
    c.cw2 * IMPACT_POINTS.clutchWon[2] +
    c.cw3 * IMPACT_POINTS.clutchWon[3] +
    c.cw4 * IMPACT_POINTS.clutchWon[4] +
    c.cw5 * IMPACT_POINTS.clutchWon[5]
  );
}

export const PARTS = ['kills', 'survival', 'kast', 'damage', 'impact'] as const;
export type Part = (typeof PARTS)[number];
export type Parts = Record<Part, number>;

/** As 5 partes de um lado, por round. */
export function partRates(c: SideCounts): Parts {
  return {
    kills: c.kills / c.rounds,
    survival: c.survivedRounds / c.rounds,
    kast: c.kastRounds / c.rounds,
    damage: c.damage / c.rounds,
    impact: impactPoints(c) / c.rounds,
  };
}

export interface SidePopulation {
  accounts: number;
  mean: Parts;
  /** Desvio-padrão da população (divisor N). */
  sd: Parts;
}

/** A população de um Modo e lado: as Contas com `RATING_MIN_ROUNDS` ou mais naquele lado. */
export function sidePopulation(sides: readonly SideCounts[]): SidePopulation | null {
  const eligible = sides.filter((s) => s.rounds >= RATING_MIN_ROUNDS);
  if (eligible.length < POPULATION_MIN_ACCOUNTS) return null;
  const rates = eligible.map(partRates);
  const mean = {} as Parts;
  const sd = {} as Parts;
  for (const part of PARTS) {
    const values = rates.map((r) => r[part]);
    const m = values.reduce((a, b) => a + b, 0) / values.length;
    mean[part] = m;
    sd[part] = Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
  }
  return { accounts: eligible.length, mean, sd };
}

export type RatingResult =
  | { status: 'calibrating'; rounds: number }
  | { status: 'no_rounds' }
  | { status: 'no_population' }
  | {
      status: 'rated';
      rounds: number;
      z: Partial<Record<'ct' | 't', Parts>>;
      side: Partial<Record<'ct' | 't', number>>;
      raw: number;
      rating: number;
      shown: string;
    };

const clip = (z: number): number => Math.max(-RATING_Z_CLIP, Math.min(RATING_Z_CLIP, z));

/** O Rating de uma Conta num Modo, na janela das `counts`. */
export function rate(
  lifetimeRounds: number,
  counts: { ct: SideCounts; t: SideCounts },
  population: { ct: SidePopulation | null; t: SidePopulation | null },
): RatingResult {
  if (lifetimeRounds < RATING_MIN_ROUNDS) return { status: 'calibrating', rounds: lifetimeRounds };
  const n = counts.ct.rounds + counts.t.rounds;
  if (n === 0) return { status: 'no_rounds' };

  const z: Partial<Record<'ct' | 't', Parts>> = {};
  const side: Partial<Record<'ct' | 't', number>> = {};
  let weighted = 0;
  for (const s of ['ct', 't'] as const) {
    if (counts[s].rounds === 0) continue;
    const pop = population[s];
    if (pop === null) return { status: 'no_population' };
    const rates = partRates(counts[s]);
    const zs = {} as Parts;
    let sum = 0;
    for (const part of PARTS) {
      zs[part] = pop.sd[part] < 1e-9 ? 0 : clip((rates[part] - pop.mean[part]) / pop.sd[part]);
      sum += zs[part];
    }
    z[s] = zs;
    side[s] = 1 + RATING_SPREAD * (sum / PARTS.length);
    weighted += counts[s].rounds * (side[s] as number);
  }
  const raw = weighted / n;
  const rating = 1 + (raw - 1) * (n / (n + RATING_PULL_K));
  return { status: 'rated', rounds: n, z, side, raw, rating, shown: rating.toFixed(2) };
}

/** O Rating geral: a média dos Ratings dos Modos que aparecem, pesada pelos rounds da janela. */
export function overall(modes: readonly RatingResult[]): number | null {
  const rated = modes.filter(
    (m): m is Extract<RatingResult, { status: 'rated' }> => m.status === 'rated',
  );
  const rounds = rated.reduce((a, m) => a + m.rounds, 0);
  if (rounds === 0) return null;
  return rated.reduce((a, m) => a + m.rating * m.rounds, 0) / rounds;
}
