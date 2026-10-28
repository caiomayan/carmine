import { type GameMode, weekSummarySchema } from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountStatsWeekly } from '../src/database/schema.js';
import { weekEndOf, weekStartOf } from '../src/stats/stats-week.js';
import { startTestApp, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';
import { installStableClock } from './support/stable-clock.js';

// Antes de qualquer `new Date()` do arquivo: sem cruzar a meia-noite de Brasília durante o teste.
installStableClock();

const THIS_WEEK = weekStartOf(new Date());
const LAST_WEEK = weekStartOf(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
const OLDER_WEEK = weekStartOf(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));

describe('Os números da semana da home (GET /api/stats/week)', () => {
  let t: TestApp;
  let next = 1;

  beforeAll(async () => {
    t = await startTestApp({ WEEK_SUMMARY_CACHE_TTL_SECONDS: '0' });
  });

  afterAll(async () => {
    await t?.stop();
  });

  const seed = async (
    mode: GameMode,
    over: Partial<typeof accountStatsWeekly.$inferInsert>,
    weekStart = THIS_WEEK,
  ) => {
    const who = await signedInPlayer(t, next++);
    await t.postgres.db.insert(accountStatsWeekly).values({
      accountId: who.account.id,
      mode,
      weekStart,
      ...over,
    });
    return who;
  };

  const summary = async () => {
    const response = await t.app.inject({ url: '/api/stats/week' });
    expect(response.statusCode, response.body).toBe(200);
    return { response, body: weekSummarySchema.parse(response.json()) };
  };

  it('sem nenhum jogo, a semana vem zerada e sem semana anterior', async () => {
    const { body } = await summary();
    expect(body).toEqual({
      weekStart: THIS_WEEK,
      weekEnd: weekEndOf(THIS_WEEK),
      current: { players: 0, kills: 0, headshots: 0, secondsPlayed: 0 },
      previous: null,
    });
  });

  it('soma as Contas da semana atual e conta cada Conta uma vez, mesmo com dois Modos', async () => {
    const both = await seed('retake', { kills: 10, headshots: 4, secondsPlayed: 3600 });
    await t.postgres.db.insert(accountStatsWeekly).values({
      accountId: both.account.id,
      mode: 'deathmatch',
      weekStart: THIS_WEEK,
      kills: 20,
      headshots: 5,
      secondsPlayed: 1800,
    });
    await seed('deathmatch', { kills: 5, headshots: 1, secondsPlayed: 600 });

    const { body } = await summary();
    expect(body.current).toEqual({
      players: 2,
      kills: 35,
      headshots: 10,
      secondsPlayed: 6000,
    });
  });

  it('traz a semana anterior para comparar e ignora as mais antigas', async () => {
    await seed('retake', { kills: 7, headshots: 2, secondsPlayed: 1200 }, LAST_WEEK);
    await seed('retake', { kills: 1000, secondsPlayed: 99_999 }, OLDER_WEEK);

    const { body } = await summary();
    expect(body.previous).toEqual({ players: 1, kills: 7, headshots: 2, secondsPlayed: 1200 });
    expect(body.current.players).toBe(2);
  });

  it('é público, não identifica ninguém e pode ser guardado por 30 s', async () => {
    const { response } = await summary();
    expect(response.headers['cache-control']).toBe('public, max-age=30');
    expect(response.body).not.toMatch(/steam|account|publicId|displayName/i);
  });
});
