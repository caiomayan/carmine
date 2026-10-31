import {
  DM_SCORE_MIN_POPULATION,
  type GameMode,
  profileStatsSchema,
  type Ranking,
  rankingSchema,
} from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountStatsDaily, accountStatsWeekly } from '../src/database/schema.js';
import {
  type DmPart,
  type DmPopulation,
  type DmSums,
  dmParts,
  dmScore,
} from '../src/stats/dm-score.js';
import { dayOf, weekStartOf } from '../src/stats/stats-week.js';
import { startTestApp, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';
import { installStableClock } from './support/stable-clock.js';

// Antes de qualquer `new Date()` do arquivo: sem cruzar a meia-noite de Brasília durante o teste.
installStableClock();

const TODAY = dayOf(new Date());
const THIS_WEEK = weekStartOf(new Date());
const LAST_WEEK = weekStartOf(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
const MINUTE = 60;

/** Uma Conta de DM, variando com `i` para a população ter desvio em todas as partes. */
function sumsOf(i: number, seconds = 60 * MINUTE + i * MINUTE): DmSums {
  const kills = 300 + 17 * i;
  return {
    kills,
    deaths: 280 + ((i * 7) % 40),
    headshots: Math.round(kills * (0.2 + (i % 9) * 0.03)),
    damage: kills * (95 + (i % 5) * 6),
    secondsPlayed: seconds,
  };
}

/** Média e desvio (da população, como o `stddev_pop` da consulta) de cada parte. */
function populationOf(accounts: readonly DmSums[]): DmPopulation {
  const parts = accounts.map((sums) => dmParts(sums) as NonNullable<ReturnType<typeof dmParts>>);
  const stat = (pick: (p: (typeof parts)[number]) => number): DmPart => {
    const values = parts.map(pick);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return { mean, sd: Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) };
  };
  return {
    accounts: accounts.length,
    killsPerMinute: stat((p) => p.killsPerMinute),
    kd: stat((p) => p.kd),
    damagePerMinute: stat((p) => p.damagePerMinute),
    headshotPercent: stat((p) => p.headshotPercent),
  };
}

describe('Pontuação DM (S21, ADR 0030)', () => {
  let t: TestApp;
  let next = 1;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  const player = async () => signedInPlayer(t, next++);
  type Player = Awaited<ReturnType<typeof player>>;

  /** A semana e o dia de uma Conta direto nos agregados (a coleta já é testada em stats). */
  const seed = async (
    who: Player,
    mode: GameMode,
    sums: DmSums,
    weekStart: string,
    day: string,
    roundsPlayed = 0,
  ): Promise<void> => {
    const counts = { ...sums, roundsPlayed, roundsWon: 0, assists: 0 };
    await t.postgres.db
      .insert(accountStatsWeekly)
      .values({ accountId: who.account.id, mode, weekStart, ...counts });
    await t.postgres.db
      .insert(accountStatsDaily)
      .values({ accountId: who.account.id, mode, day, ...counts });
  };

  const ranking = async (mode: GameMode, query = ''): Promise<Ranking> => {
    const response = await t.app.inject({ url: `/api/ranking/${mode}${query}` });
    expect(response.statusCode, response.body).toBe(200);
    return rankingSchema.parse(response.json());
  };

  const profileModes = async (who: Player) =>
    profileStatsSchema.parse(
      (await t.app.inject({ url: `/api/profiles/${who.account.publicId}/stats` })).json(),
    ).modes;

  const flush = () => t.valkey.executeCliCmd('flushall');

  // As Contas da semana passada: poucas demais para haver população (nem a média nem o desvio valem).
  const lastWeek: { who: Player; sums: DmSums }[] = [];
  // As desta semana: com as da semana passada (a janela de 90 dias as inclui), passam do mínimo.
  const thisWeek: { who: Player; sums: DmSums }[] = [];

  it('com menos Contas elegíveis do que o mínimo da população, a pontuação é nula (nunca inventada)', async () => {
    for (let i = 0; i < 5; i++) {
      const who = await player();
      const sums = sumsOf(i);
      lastWeek.push({ who, sums });
      await seed(who, 'deathmatch', sums, LAST_WEEK, LAST_WEEK);
    }
    await flush();

    const past = await ranking('deathmatch', `?week=${LAST_WEEK}`);

    expect(past.entries).toHaveLength(5);
    expect(past.entries.every((entry) => entry.dmScore === null)).toBe(true);
  });

  it('o Ranking e o Perfil do DM trazem a Pontuação contra a população dos 90 dias, sem mudar a ordem', async () => {
    for (let i = 5; i < 5 + DM_SCORE_MIN_POPULATION + 1; i++) {
      const who = await player();
      const sums = sumsOf(i);
      thisWeek.push({ who, sums });
      await seed(who, 'deathmatch', sums, THIS_WEEK, TODAY);
    }
    await flush();
    const population = populationOf([...lastWeek, ...thisWeek].map((entry) => entry.sums));
    expect(population.accounts).toBeGreaterThanOrEqual(DM_SCORE_MIN_POPULATION);

    const result = await ranking('deathmatch');

    const byId = new Map(thisWeek.map((entry) => [entry.who.account.publicId, entry.sums]));
    const mine = result.entries.filter((entry) => byId.has(entry.player.publicId ?? 0));
    expect(mine).toHaveLength(thisWeek.length);
    for (const entry of mine) {
      const expected = dmScore(byId.get(entry.player.publicId ?? 0) as DmSums, population);
      expect(expected).not.toBeNull();
      expect(Math.abs((entry.dmScore as number) - (expected as number))).toBeLessThanOrEqual(0.101);
    }
    // A ordem segue sendo a de abates por minuto (S21: o DM continua por KPM).
    const scores = mine.map((entry) => entry.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    // O Perfil: a mesma janela, e o Retake não ganha o campo.
    const sample = thisWeek[3] as { who: Player; sums: DmSums };
    const [dm] = await profileModes(sample.who);
    expect(dm).toMatchObject({ mode: 'deathmatch' });
    const own = dmScore(sample.sums, population) as number;
    expect(Math.abs((dm?.dmScore as number) - own)).toBeLessThanOrEqual(0.101);
  });

  it('o Retake não traz Pontuação DM, no Ranking nem no Perfil', async () => {
    const who = await player();
    await seed(who, 'retake', { ...sumsOf(2), secondsPlayed: 3600 }, THIS_WEEK, TODAY, 60);
    await flush();

    const result = await ranking('retake');

    expect(result.entries.every((entry) => !('dmScore' in entry))).toBe(true);
    const [retake] = await profileModes(who);
    expect(retake).toMatchObject({ mode: 'retake' });
    expect(retake).not.toHaveProperty('dmScore');
  });

  it('abaixo do mínimo de minutos do Ranking do DM, o Perfil não tem Pontuação', async () => {
    const who = await player();
    await seed(who, 'deathmatch', sumsOf(40, 29 * MINUTE + 59), THIS_WEEK, TODAY);

    const [dm] = await profileModes(who);

    expect(dm).toMatchObject({ mode: 'deathmatch', dmScore: null });
  });
});
