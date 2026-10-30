import { readFileSync } from 'node:fs';
import { RATING_MIN_ROUNDS } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import {
  addRatingCounts,
  buildSidePopulation,
  computeOverall,
  computeRating,
  displayRating,
  emptyRatingCounts,
  impactPoints,
  RATING_POPULATION_MIN_ACCOUNTS,
  RATING_PULL_K,
  RATING_SPREAD,
  RATING_Z_CLIP,
  type RatingComputation,
  type RatingCounts,
  ratingParts,
} from './rating.js';

/** A planilha de conferência da fórmula v1 (ADR 0029): a entrada e a resposta, escritas à parte. */
const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../test/support/rating-v1/${name}`, import.meta.url), 'utf8'),
  );

interface SheetAccount {
  id: string;
  lifetimeRounds: number;
  ct: RatingCounts;
  t: RatingCounts;
}
const { accounts } = fixture('population.json') as { accounts: SheetAccount[] };
const expected = fixture('expected.json') as {
  population: Record<
    'ct' | 't',
    { accounts: number; mean: Record<string, number>; sd: Record<string, number> }
  >;
  results: { id: string; result: RatingComputation & { shown?: string } }[];
  populationMean: number;
  overallExample: number;
};

const population = {
  ct: buildSidePopulation(accounts.map((a) => a.ct)),
  t: buildSidePopulation(accounts.map((a) => a.t)),
};
const ratingOf = (id: string) => {
  const account = accounts.find((a) => a.id === id) as SheetAccount;
  return computeRating(account.lifetimeRounds, { ct: account.ct, t: account.t }, population);
};

describe('Rating Carmine v1 contra a planilha de conferência (ADR 0029)', () => {
  it('a população tem a média e o desvio da planilha', () => {
    for (const side of ['ct', 't'] as const) {
      const got = population[side];
      expect(got?.accounts).toBe(expected.population[side].accounts);
      for (const part of ['kills', 'survival', 'kast', 'damage', 'impact'] as const) {
        expect(got?.mean[part]).toBeCloseTo(expected.population[side].mean[part] as number, 9);
        expect(got?.sd[part]).toBeCloseTo(expected.population[side].sd[part] as number, 9);
      }
    }
  });

  it('o Rating de cada Conta bate com a planilha, inclusive os estados', () => {
    for (const { id, result } of expected.results) {
      const got = ratingOf(id);
      expect(got.status, id).toBe(result.status);
      if (got.status === 'rated' && result.status === 'rated') {
        expect(got.rating, id).toBeCloseTo(result.rating, 9);
        expect(got.raw, id).toBeCloseTo(result.raw, 9);
        expect(displayRating(got.rating), id).toBe(Number(result.shown));
      }
      if (got.status === 'calibrating' && result.status === 'calibrating') {
        expect(got.rounds).toBe(result.rounds);
      }
    }
  });

  it('a média do Rating da população fica em 1,00 (± 0,02), Aceite da S21', () => {
    const ratings = accounts
      .filter((a) => a.ct.rounds >= RATING_MIN_ROUNDS || a.t.rounds >= RATING_MIN_ROUNDS)
      .map((a) => ratingOf(a.id));
    const rated = ratings.flatMap((r) => (r.status === 'rated' ? [r.rating] : []));
    expect(rated).toHaveLength(ratings.length);
    const mean = rated.reduce((a, b) => a + b, 0) / rated.length;
    expect(Math.abs(mean - 1)).toBeLessThanOrEqual(0.02);
    expect(mean).toBeCloseTo(expected.populationMean, 9);
  });

  it('o Rating geral do exemplo da planilha', () => {
    const c01 = ratingOf('c01') as Extract<RatingComputation, { status: 'rated' }>;
    const overall = computeOverall([
      c01,
      { ...c01, rating: 1.1, rounds: c01.rounds * 2 },
      { status: 'calibrating', rounds: 40 },
    ]);
    expect(overall?.rating).toBeCloseTo(expected.overallExample, 9);
  });

  it('as contagens à mão: 12 linhas de resumo viram 5,5 pontos de impacto no CT e 13,5 no T', () => {
    const { counts } = fixture('rounds-sample.json') as {
      counts: Record<'ct' | 't', RatingCounts>;
    };
    expect(impactPoints(counts.ct)).toBeCloseTo(5.5, 12);
    expect(impactPoints(counts.t)).toBeCloseTo(13.5, 12);
    expect(ratingParts(counts.ct).kills).toBeCloseTo(1, 12);
    expect(ratingParts(counts.t).damage).toBeCloseTo(175, 12);
  });
});

describe('bordas da calculadora', () => {
  const side = (over: Partial<RatingCounts> = {}): RatingCounts => ({
    ...emptyRatingCounts(),
    rounds: 100,
    kills: 60,
    survivedRounds: 50,
    kastRounds: 80,
    damage: 7800,
    ...over,
  });
  const crowd = (make: (i: number) => RatingCounts) =>
    Array.from({ length: RATING_POPULATION_MIN_ACCOUNTS }, (_, i) => make(i));

  it('menos de 20 Contas no lado: sem população, sem Rating', () => {
    expect(buildSidePopulation(crowd(() => side()).slice(1))).toBeNull();
    expect(computeRating(500, { ct: side(), t: side() }, { ct: null, t: null }).status).toBe(
      'no_population',
    );
  });

  it('quem tem 99 rounds no lado fica fora da população, e 100 entra', () => {
    expect(buildSidePopulation([...crowd(() => side()), side({ rounds: 99 })])?.accounts).toBe(20);
    expect(buildSidePopulation([...crowd(() => side()), side({ rounds: 100 })])?.accounts).toBe(21);
  });

  it('99 rounds é Calibrando e 100 já mostra o número', () => {
    const pop = buildSidePopulation(crowd(() => side()));
    const both = { ct: pop, t: pop };
    expect(computeRating(99, { ct: side({ rounds: 99 }), t: emptyRatingCounts() }, both)).toEqual({
      status: 'calibrating',
      rounds: 99,
    });
    expect(computeRating(100, { ct: side(), t: emptyRatingCounts() }, both).status).toBe('rated');
  });

  it('desvio zero não divide por zero: a parte vale 0 e o Rating é 1,00', () => {
    const pop = buildSidePopulation(crowd(() => side()));
    const r = computeRating(300, { ct: side(), t: side() }, { ct: pop, t: pop });
    expect(r).toMatchObject({ status: 'rated', rating: 1 });
  });

  it('desvio de 1e-16 (ruído de ponto flutuante) também vale zero', () => {
    // Todas com o mesmo KAST: a conta da média deixa um desvio de ~1e-16 em vez de 0 exato.
    const pop = buildSidePopulation(crowd((i) => side({ kills: 50 + i })));
    expect(pop?.sd.kast).toBeGreaterThan(0);
    const r = computeRating(
      200,
      { ct: side({ kastRounds: 10 }), t: emptyRatingCounts() },
      {
        ct: pop,
        t: null,
      },
    );
    if (r.status !== 'rated') throw new Error('esperava Rating');
    // Só os abates (0,600 contra a média de 0,595) mexem; o KAST de 0,10 não vira -3 desvios (0,88).
    expect(r.sides.ct).toBeGreaterThan(0.99);
    expect(r.sides.ct).toBeLessThan(1.01);
  });

  it('uma parte absurda não passa de 3 desvios', () => {
    const pop = buildSidePopulation(crowd((i) => side({ kills: 50 + i })));
    const r = computeRating(
      200,
      { ct: side({ rounds: 1_000_000, kills: 1_000_000_000 }), t: emptyRatingCounts() },
      { ct: pop, t: null },
    );
    if (r.status !== 'rated') throw new Error('esperava Rating');
    // Só os abates passam do limite; as outras 4 partes valem 0 (iguais à população): 1 + 0,2 · 3 / 5.
    expect(r.sides.ct).toBeCloseTo(1 + (RATING_SPREAD * RATING_Z_CLIP) / 5, 12);
  });

  it('o puxão: n / (n + 50) do caminho até o bruto', () => {
    const pop = buildSidePopulation(crowd((i) => side({ kills: 50 + i })));
    const window = { ct: side({ kills: 90 }), t: emptyRatingCounts() };
    const r = computeRating(100, window, { ct: pop, t: null });
    if (r.status !== 'rated') throw new Error('esperava Rating');
    expect(r.rating).toBeCloseTo(1 + (r.raw - 1) * (100 / (100 + RATING_PULL_K)), 12);
  });

  it('lifetime alto e janela vazia: sem rounds', () => {
    expect(
      computeRating(
        300,
        { ct: emptyRatingCounts(), t: emptyRatingCounts() },
        { ct: null, t: null },
      ),
    ).toEqual({ status: 'no_rounds' });
  });

  it('o Rating geral ignora Modos que não aparecem e vale null sem nenhum', () => {
    const rated = (rating: number, rounds: number): RatingComputation => ({
      status: 'rated',
      rounds,
      sides: {},
      raw: rating,
      rating,
    });
    expect(
      computeOverall([rated(1.2, 300), rated(0.9, 100), { status: 'no_rounds' }])?.rating,
    ).toBeCloseTo(1.125, 12);
    expect(computeOverall([{ status: 'calibrating', rounds: 3 }])).toBeNull();
  });

  it('somar contagens soma todos os campos', () => {
    const a = side({ openingKills: 2, cw3: 1 });
    const sum = addRatingCounts(a, a);
    expect(sum.rounds).toBe(200);
    expect(sum.openingKills).toBe(4);
    expect(sum.cw3).toBe(2);
  });
});
