import { readFileSync } from 'node:fs';
import { RATING_MIN_ROUNDS, RATING_WINDOW_DAYS } from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountRatingDaily, ratingPopulation } from '../src/database/schema.js';
import {
  emptyRatingCounts,
  RATING_FORMULA_VERSION,
  type RatingComputation,
  type RatingCounts,
} from '../src/stats/rating.js';
import { windowEndingNow } from '../src/stats/rating-counts.js';
import { RatingPopulations } from '../src/stats/rating-populations.js';
import { RatingReader } from '../src/stats/rating-reader.js';
import { dayOf, weekStartOf } from '../src/stats/stats-week.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A planilha de conferência da fórmula v1 (ADR 0029), a mesma que o unitário usa. */
const sheet = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./support/rating-v1/${name}`, import.meta.url), 'utf8'));
const { accounts: sheetAccounts } = sheet('population.json') as {
  accounts: { id: string; lifetimeRounds: number; ct: RatingCounts; t: RatingCounts }[];
};
const expected = sheet('expected.json') as {
  results: { id: string; result: RatingComputation }[];
};

describe('Rating Carmine (S21): população semanal e leitor contra a planilha de conferência', () => {
  let t: TestApp;
  const db = () => t.postgres.db;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  const account = async (n: number) => {
    await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId: steamIdFor(n), steamName: `jogador${n}` },
    });
    return (await signedInPlayer(t, n)).account.id;
  };

  const countsRow = (accountId: string, day: string, side: 'ct' | 't', counts: RatingCounts) => ({
    accountId,
    day,
    mode: 'retake' as const,
    map: 'de_mirage',
    side,
    ...counts,
  });

  const now = new Date();
  const recent = dayOf(new Date(now.getTime() - 3 * DAY_MS));
  const old = dayOf(new Date(now.getTime() - 200 * DAY_MS));

  it('sem Contas suficientes não há população, e quem tem 100 rounds fica sem Rating', async () => {
    const id = await account(900);
    await db()
      .insert(accountRatingDaily)
      .values(countsRow(id, recent, 'ct', { ...emptyRatingCounts(), rounds: 150, kills: 90 }));
    const populations = new RatingPopulations(db());
    expect(await populations.ensureWeek(now)).toBe(0);
    const reader = new RatingReader(db(), populations);
    expect(await reader.profileRating(id, 'retake', now)).toEqual({ status: 'no_population' });
    await db().delete(accountRatingDaily).where(eq(accountRatingDaily.accountId, id));
  });

  it('o Rating lido do banco bate com a planilha de cada Conta, e a população vale a semana', async () => {
    const ids = new Map<string, string>();
    for (const [i, a] of sheetAccounts.entries()) {
      const id = await account(1000 + i);
      ids.set(a.id, id);
      const rows = (['ct', 't'] as const)
        .filter((side) => a[side].rounds > 0)
        .map((side) => countsRow(id, recent, side, a[side]));
      // Os rounds de antes da janela de 90 dias: contam para o Calibrando, não para o Rating.
      const extra = a.lifetimeRounds - a.ct.rounds - a.t.rounds;
      if (extra > 0) {
        rows.push(countsRow(id, old, 'ct', { ...emptyRatingCounts(), rounds: extra }));
      }
      if (rows.length > 0) await db().insert(accountRatingDaily).values(rows);
    }

    const populations = new RatingPopulations(db());
    expect(await populations.ensureWeek(now)).toBe(2);
    // Já existe na semana: não recalcula, para o Rating não se mexer no meio dela.
    expect(await populations.ensureWeek(now)).toBe(0);
    const stored = await db().select().from(ratingPopulation);
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({
      version: RATING_FORMULA_VERSION,
      weekStart: weekStartOf(now),
      mode: 'retake',
    });

    const reader = new RatingReader(db(), populations);
    const window = windowEndingNow(now, RATING_WINDOW_DAYS);
    const computed = await reader.compute('retake', [...ids.values()], window);
    for (const { id, result } of expected.results) {
      const got = computed.get(ids.get(id) as string);
      expect(got?.status, id).toBe(result.status);
      if (got?.status === 'rated' && result.status === 'rated') {
        expect(got.rating, id).toBeCloseTo(result.rating, 9);
      }
    }

    // O que a API devolve: o Rating em 2 casas, o Calibrando com os rounds, e o geral.
    expect(await reader.profileRating(ids.get('c01') as string, 'retake', now)).toEqual({
      status: 'rated',
      rating: 0.85,
      rounds: 636,
    });
    expect(await reader.profileRating(ids.get('x01') as string, 'retake', now)).toEqual({
      status: 'calibrating',
      rounds: 37,
      required: RATING_MIN_ROUNDS,
    });
    expect(await reader.profileRating(ids.get('x05') as string, 'retake', now)).toEqual({
      status: 'no_rounds',
    });
    const c01 = await reader.profileRatings(ids.get('c01') as string, now);
    expect(c01.overall).toEqual({ rating: 0.85, rounds: 636 });
    expect((await reader.profileRatings(ids.get('x01') as string, now)).overall).toBeNull();

    // Uma Conta nova com muitos rounds depois do cálculo não mexe na população da semana.
    const late = await account(2000);
    await db()
      .insert(accountRatingDaily)
      .values(countsRow(late, recent, 'ct', { ...emptyRatingCounts(), rounds: 500, kills: 900 }));
    const again = await reader.compute('retake', [ids.get('c01') as string], window);
    const first = computed.get(ids.get('c01') as string);
    expect(again.get(ids.get('c01') as string)).toEqual(first);
  });
});
