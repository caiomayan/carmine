import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  aggregateRounds,
  emptyCounts,
  overall,
  POPULATION_MIN_ACCOUNTS,
  partRates,
  RATING_MIN_ROUNDS,
  RATING_PULL_K,
  RATING_SPREAD,
  RATING_Z_CLIP,
  type RatingResult,
  type RoundRow,
  rate,
  type SideCounts,
  sidePopulation,
} from './oracle.ts';

const load = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8')) as T;

interface Account {
  id: string;
  lifetimeRounds: number;
  ct: SideCounts;
  t: SideCounts;
}
const { accounts } = load<{ accounts: Account[] }>('./population.json');
const expected = load<{
  population: { ct: { accounts: number }; t: { accounts: number } };
  results: { id: string; result: RatingResult }[];
  populationMean: number;
  overallExample: number;
}>('./expected.json');

const population = {
  ct: sidePopulation(accounts.map((a) => a.ct)),
  t: sidePopulation(accounts.map((a) => a.t)),
};
const byId = (id: string) => {
  const account = accounts.find((a) => a.id === id) as Account;
  return rate(account.lifetimeRounds, { ct: account.ct, t: account.t }, population);
};

describe('planilha de conferência da fórmula v1 (ADR 0029)', () => {
  it('o expected.json é o que o oráculo calcula da população.json (rode gerar.ts se mudar a fórmula)', () => {
    expect(population.ct?.accounts).toBe(expected.population.ct.accounts);
    expect(population.t?.accounts).toBe(expected.population.t.accounts);
    for (const { id, result } of expected.results) {
      const now = byId(id);
      expect(now.status).toBe(result.status);
      if (now.status === 'rated' && result.status === 'rated') {
        expect(now.rating).toBeCloseTo(result.rating, 9);
        expect(now.shown).toBe(result.shown);
      }
    }
  });

  it('a média do Rating da população fica em 1,00 (± 0,02), Aceite da S21', () => {
    const eligible = accounts.filter((a) => a.ct.rounds >= RATING_MIN_ROUNDS || a.t.rounds >= 100);
    const ratings = eligible.map((a) => byId(a.id));
    const rated = ratings.flatMap((r) => (r.status === 'rated' ? [r.rating] : []));
    expect(rated).toHaveLength(eligible.length);
    const mean = rated.reduce((a, b) => a + b, 0) / rated.length;
    expect(Math.abs(mean - 1)).toBeLessThanOrEqual(0.02);
    expect(mean).toBeCloseTo(expected.populationMean, 9);
  });

  it('com 37 rounds no Modo, `Calibrando 37/100`, sem número', () => {
    expect(byId('x01')).toEqual({ status: 'calibrating', rounds: 37 });
  });

  it('com 100 rounds ou mais o Rating aparece, mesmo fora da população', () => {
    const r = byId('x02');
    expect(r.status).toBe('rated');
  });

  it('o puxão: 12 rounds na janela deixam o Rating perto de 1,00 (k = 50)', () => {
    const r = byId('x03');
    if (r.status !== 'rated') throw new Error('esperava Rating');
    expect(r.rating).toBeCloseTo(1 + (r.raw - 1) * (12 / (12 + RATING_PULL_K)), 12);
    expect(Math.abs(r.rating - 1)).toBeLessThan(Math.abs(r.raw - 1));
  });

  it('100 rounds na vida e nenhum na janela: sem Rating nos 90 dias', () => {
    expect(byId('x05')).toEqual({ status: 'no_rounds' });
  });

  it('quem só jogou um lado tem o Rating desse lado', () => {
    const r = byId('x04');
    if (r.status !== 'rated') throw new Error('esperava Rating');
    expect(r.side.t).toBeUndefined();
    expect(r.side.ct).toBeDefined();
    expect(r.raw).toBeCloseTo(r.side.ct as number, 12);
  });

  it('o Rating é o bruto de cada lado ponderado pelos rounds, puxado depois', () => {
    const account = accounts.find((a) => a.id === 'c01') as Account;
    const r = byId('c01');
    if (r.status !== 'rated') throw new Error('esperava Rating');
    const { ct, t } = r.side as { ct: number; t: number };
    const n = account.ct.rounds + account.t.rounds;
    const raw = (account.ct.rounds * ct + account.t.rounds * t) / n;
    expect(r.raw).toBeCloseTo(raw, 12);
    expect(r.rating).toBeCloseTo(1 + (raw - 1) * (n / (n + RATING_PULL_K)), 12);
    for (const side of ['ct', 't'] as const) {
      const z = r.z[side];
      const mean = Object.values(z ?? {}).reduce((a, b) => a + b, 0) / 5;
      expect(r.side[side]).toBeCloseTo(1 + RATING_SPREAD * mean, 12);
    }
  });

  it('o Rating geral soma só os Modos que aparecem, pesados pelos rounds', () => {
    const rated = (rating: number, rounds: number): RatingResult => ({
      status: 'rated',
      rounds,
      z: {},
      side: {},
      raw: rating,
      rating,
      shown: rating.toFixed(2),
    });
    const mixed = overall([
      rated(1.2, 300),
      rated(0.9, 100),
      { status: 'calibrating', rounds: 40 },
      { status: 'no_rounds' },
    ]);
    expect(mixed).toBeCloseTo((1.2 * 300 + 0.9 * 100) / 400, 12);
    expect(overall([{ status: 'calibrating', rounds: 40 }])).toBeNull();
    expect(overall([])).toBeNull();
  });
});

describe('população e bordas da fórmula v1', () => {
  const side = (over: Partial<SideCounts>): SideCounts => ({
    ...emptyCounts(),
    rounds: 100,
    kills: 60,
    survivedRounds: 50,
    kastRounds: 80,
    damage: 7800,
    ...over,
  });

  it('com menos de 20 Contas elegíveis no Modo e lado não há população nem Rating', () => {
    const few = Array.from({ length: POPULATION_MIN_ACCOUNTS - 1 }, () => side({}));
    expect(sidePopulation(few)).toBeNull();
    const pop = { ct: null, t: null };
    expect(rate(500, { ct: side({}), t: side({}) }, pop)).toEqual({ status: 'no_population' });
  });

  it('quem tem menos de 100 rounds no lado não entra na população desse lado', () => {
    const crowd = Array.from({ length: POPULATION_MIN_ACCOUNTS }, () => side({}));
    expect(sidePopulation([...crowd, side({ rounds: 99 })])?.accounts).toBe(
      POPULATION_MIN_ACCOUNTS,
    );
    expect(sidePopulation([...crowd, side({ rounds: 100 })])?.accounts).toBe(
      POPULATION_MIN_ACCOUNTS + 1,
    );
  });

  it('desvio zero numa parte não divide por zero: a parte vale 0 e o Rating é 1,00', () => {
    const crowd = Array.from({ length: POPULATION_MIN_ACCOUNTS }, () => side({}));
    const pop = { ct: sidePopulation(crowd), t: sidePopulation(crowd) };
    const r = rate(300, { ct: side({}), t: side({}) }, pop);
    if (r.status !== 'rated') throw new Error('esperava Rating');
    expect(r.rating).toBe(1);
  });

  it('uma parte absurda não passa de 3 desvios', () => {
    const crowd = Array.from({ length: POPULATION_MIN_ACCOUNTS }, (_, i) =>
      side({ kills: 50 + i }),
    );
    const pop = { ct: sidePopulation(crowd), t: sidePopulation(crowd) };
    const r = rate(200, { ct: side({ kills: 100000 }), t: emptyCounts() }, pop);
    if (r.status !== 'rated') throw new Error('esperava Rating');
    expect(r.z.ct?.kills).toBe(RATING_Z_CLIP);
  });

  it('100 rounds é o primeiro número, 99 ainda é Calibrando', () => {
    const crowd = Array.from({ length: POPULATION_MIN_ACCOUNTS }, () => side({}));
    const pop = { ct: sidePopulation(crowd), t: sidePopulation(crowd) };
    expect(rate(99, { ct: side({ rounds: 99 }), t: emptyCounts() }, pop).status).toBe(
      'calibrating',
    );
    expect(rate(100, { ct: side({}), t: emptyCounts() }, pop).status).toBe('rated');
  });
});

describe('da linha do resumo do round às contagens (a soma que a P3 faz)', () => {
  const { rows, counts } = load<{
    rows: RoundRow[];
    counts: { ct: SideCounts; t: SideCounts };
  }>('./rounds-sample.json');

  // Contado à mão sobre as 12 linhas de rounds-sample.json: 6 de CT e 6 de T.
  it('CT: 6 rounds, 6 abates, 3 sobreviveu, 5 KAST, 553 de dano, 2 aberturas, 1 perdida, 2k, 3k e um clutch 1v2', () => {
    expect(counts.ct).toEqual({
      rounds: 6,
      kills: 6,
      survivedRounds: 3,
      kastRounds: 5,
      damage: 553,
      openingKills: 2,
      openingDeaths: 1,
      mk2: 1,
      mk3: 1,
      mk4: 0,
      mk5: 0,
      cw1: 0,
      cw2: 1,
      cw3: 0,
      cw4: 0,
      cw5: 0,
    });
  });

  it('T: 12 abates, 5k, 4k e 2k, clutches 1v1 e 1v3 vencidos, e o 1v1 perdido não conta', () => {
    expect(counts.t).toEqual({
      rounds: 6,
      kills: 12,
      survivedRounds: 4,
      kastRounds: 5,
      damage: 1050,
      openingKills: 1,
      openingDeaths: 1,
      mk2: 1,
      mk3: 0,
      mk4: 1,
      mk5: 1,
      cw1: 1,
      cw2: 0,
      cw3: 1,
      cw4: 0,
      cw5: 0,
    });
  });

  it('o Impacto vale 5,5 pontos no CT e 13,5 no T (pesos do ADR 0029)', () => {
    expect(partRates(counts.ct).impact * 6).toBeCloseTo(5.5, 12);
    expect(partRates(counts.t).impact * 6).toBeCloseTo(13.5, 12);
  });

  it('o aggregateRounds refaz o que está no arquivo', () => {
    expect(aggregateRounds(rows)).toEqual(counts);
  });
});
