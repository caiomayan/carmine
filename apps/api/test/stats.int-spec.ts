import {
  type EventBatch,
  eventBatchResultSchema,
  type KillEvent,
  PROFILE_SERIES_WEEKS,
  profileSeriesSchema,
  profileStatsSchema,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountStatsWeekly, gameEvents, teamKills } from '../src/database/schema.js';
import { seriesWeeks } from '../src/stats/stats-series.js';
import { weekStartOf } from '../src/stats/stats-week.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';
import { installStableClock } from './support/stable-clock.js';

// Antes de qualquer `new Date()` do arquivo: sem cruzar a meia-noite de Brasília durante o teste.
installStableClock();

const NOW = new Date().toISOString();

let seq = 0;
/** UUID v7 de mentira, único por chamada. */
const eventId = () => `0199f2a0-7b1c-7000-8000-${String(++seq).padStart(12, '0')}`;

const kill = (killer: string, victim: string, over: Partial<KillEvent> = {}): KillEvent => ({
  id: eventId(),
  at: NOW,
  warmup: false,
  killerSteamId: killer,
  killerIsBot: false,
  victimSteamId: victim,
  victimIsBot: false,
  assisterSteamId: null,
  assisterIsBot: false,
  headshot: false,
  weapon: 'ak47',
  teamKill: false,
  ...over,
});

const batch = (events: Partial<EventBatch>): EventBatch => ({
  kills: [],
  damages: [],
  roundEnds: [],
  sessionStarts: [],
  sessionEnds: [],
  ...events,
});

describe('Eventos do jogo e Estatísticas (S12)', () => {
  let t: TestApp;
  let next = 1;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  /** Uma Conta que jogou (criada pelo connect) e já está no site. */
  const player = async (n = next++) => {
    const steamId = steamIdFor(n);
    await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName: `jogador${n}` },
    });
    return signedInPlayer(t, n);
  };

  const send = (events: EventBatch, key = t.serverKey) =>
    t.app.inject({
      method: 'POST',
      url: '/api/server/events',
      headers: { authorization: `Bearer ${key}` },
      payload: events,
    });

  const statsOf = async (publicId: number, cookie?: string) => {
    const response = await t.app.inject({
      url: `/api/profiles/${publicId}/stats`,
      ...(cookie && { headers: { cookie } }),
    });
    expect(response.statusCode, response.body).toBe(200);
    return profileStatsSchema.parse(response.json());
  };

  it('exige a chave de um Servidor Carmine', async () => {
    expect((await send(batch({}), 'chave-errada')).statusCode).toBe(401);
  });

  it('aceita a kill do jeito que o plugin manda: o que é nulo vem sem o campo', async () => {
    const killer = await player();
    const victim = await player();
    // O cliente C# omite os nulos (sem assistente, sem "assisterSteamId"): nenhum lote pode ser recusado por isso.
    const { assisterSteamId: _omitted, ...wire } = kill(killer.steamId, victim.steamId);
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/events',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { kills: [wire], damages: [], roundEnds: [], sessionStarts: [], sessionEnds: [] },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(eventBatchResultSchema.parse(response.json()).accepted).toBe(1);
    expect((await statsOf(killer.account.publicId)).total?.kills).toBe(1);
  });

  it('rejeita lote inválido', async () => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/events',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { kills: [{ id: 'não-é-uuid' }] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('uma kill com headshot aparece no Perfil na hora (Retake: tem ADR, não tem KPM)', async () => {
    const killer = await player();
    const victim = await player();

    const response = await send(
      batch({
        kills: [kill(killer.steamId, victim.steamId, { headshot: true })],
        damages: [
          {
            id: eventId(),
            at: NOW,
            warmup: false,
            attackerSteamId: killer.steamId,
            victimIsBot: false,
            teamDamage: false,
            amount: 100,
          },
        ],
        roundEnds: [
          {
            id: eventId(),
            at: NOW,
            warmup: false,
            winner: 'ct',
            players: [
              { steamId: killer.steamId, team: 'ct' },
              { steamId: victim.steamId, team: 't' },
            ],
          },
        ],
      }),
    );

    expect(response.statusCode, response.body).toBe(200);
    expect(eventBatchResultSchema.parse(response.json())).toEqual({
      accepted: 3,
      duplicates: 0,
      ignored: 0,
    });
    const stats = await statsOf(killer.account.publicId);
    expect(stats.visible).toBe(true);
    expect(stats.total).toMatchObject({ kills: 1, deaths: 0, kd: 1, headshotPercent: 100 });
    expect(stats.modes).toEqual([
      expect.objectContaining({ mode: 'retake', kills: 1, adr: 100, kpm: null }),
    ]);
    expect((await statsOf(victim.account.publicId)).total).toMatchObject({ kills: 0, deaths: 1 });
  });

  it('um lote reenviado não duplica as Estatísticas', async () => {
    const killer = await player();
    const victim = await player();
    const events = batch({ kills: [kill(killer.steamId, victim.steamId)] });

    const first = await send(events);
    const again = await send(events);

    expect(eventBatchResultSchema.parse(first.json())).toMatchObject({
      accepted: 1,
      duplicates: 0,
    });
    expect(eventBatchResultSchema.parse(again.json())).toEqual({
      accepted: 0,
      duplicates: 1,
      ignored: 0,
    });
    expect((await statsOf(killer.account.publicId)).total).toMatchObject({ kills: 1 });
  });

  it('o mesmo evento duas vezes no mesmo lote conta uma vez', async () => {
    const killer = await player();
    const victim = await player();
    const one = kill(killer.steamId, victim.steamId);

    const response = await send(batch({ kills: [one, one] }));

    expect(eventBatchResultSchema.parse(response.json())).toMatchObject({
      accepted: 1,
      duplicates: 1,
    });
    expect((await statsOf(killer.account.publicId)).total).toMatchObject({ kills: 1 });
  });

  it('kills em bots e no aquecimento não entram', async () => {
    const killer = await player();
    const victim = await player();

    const response = await send(
      batch({
        kills: [
          kill(killer.steamId, victim.steamId, { warmup: true }),
          kill(killer.steamId, victim.steamId, { victimSteamId: null, victimIsBot: true }),
          kill(killer.steamId, victim.steamId, { killerSteamId: null, killerIsBot: true }),
        ],
      }),
    );

    expect(eventBatchResultSchema.parse(response.json())).toEqual({
      accepted: 3,
      duplicates: 0,
      ignored: 3,
    });
    expect((await statsOf(killer.account.publicId)).modes).toEqual([]);
    expect((await statsOf(victim.account.publicId)).modes).toEqual([]);
  });

  it('kill em aliado não conta, mas fica registrada para a moderação', async () => {
    const killer = await player();
    const victim = await player();
    const friendly = kill(killer.steamId, victim.steamId, { teamKill: true });

    await send(batch({ kills: [friendly] }));

    expect((await statsOf(killer.account.publicId)).modes).toEqual([]);
    const logged = await t.postgres.db
      .select()
      .from(teamKills)
      .where(eq(teamKills.id, friendly.id));
    expect(logged).toEqual([
      expect.objectContaining({
        killerAccountId: killer.account.id,
        victimAccountId: victim.account.id,
        weapon: 'ak47',
      }),
    ]);
  });

  it('Conta desconhecida é ignorada e não derruba o lote', async () => {
    const known = await player();

    const response = await send(
      batch({
        kills: [kill(steamIdFor(9_999), known.steamId), kill(steamIdFor(9_998), steamIdFor(9_997))],
      }),
    );

    expect(response.statusCode).toBe(200);
    expect(eventBatchResultSchema.parse(response.json())).toMatchObject({
      accepted: 2,
      ignored: 1,
    });
    expect((await statsOf(known.account.publicId)).total).toMatchObject({ deaths: 1 });
  });

  it('o tempo jogado entra no fim da Sessão de jogo', async () => {
    const p = await player();
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 60 * 1000);

    await send(
      batch({
        sessionStarts: [
          { id: eventId(), at: start.toISOString(), sessionId: eventId(), steamId: p.steamId },
        ],
        sessionEnds: [
          {
            id: eventId(),
            at: end.toISOString(),
            sessionId: eventId(),
            steamId: p.steamId,
            startedAt: start.toISOString(),
          },
        ],
      }),
    );

    expect((await statsOf(p.account.publicId)).total).toMatchObject({ secondsPlayed: 1800 });
  });

  it('guarda o agregado semanal por Conta e Modo, pronto para o Ranking', async () => {
    const killer = await player();
    const victim = await player();
    // Segunda 2026-10-19 00:01 e domingo 2026-10-18 23:59 em Brasília: semanas diferentes.
    await send(
      batch({
        kills: [
          kill(killer.steamId, victim.steamId, { at: '2026-10-19T00:01:00-03:00' }),
          kill(killer.steamId, victim.steamId, { at: '2026-10-18T23:59:00-03:00' }),
        ],
      }),
    );

    const rows = await t.postgres.db
      .select()
      .from(accountStatsWeekly)
      .where(eq(accountStatsWeekly.accountId, killer.account.id));
    expect(rows.map((r) => [r.mode, r.weekStart, r.kills]).sort()).toEqual([
      ['retake', '2026-10-12', 1],
      ['retake', '2026-10-19', 1],
    ]);
  });

  it('guarda o ID de cada evento processado', async () => {
    const killer = await player();
    const victim = await player();
    const one = kill(killer.steamId, victim.steamId);

    await send(batch({ kills: [one] }));

    const rows = await t.postgres.db.select().from(gameEvents).where(eq(gameEvents.id, one.id));
    expect(rows).toHaveLength(1);
  });

  describe('Perfil privado (S11)', () => {
    it('esconde as Estatísticas de todos, menos da própria Conta', async () => {
      const owner = await player();
      const victim = await player();
      const visitor = await player();
      await send(batch({ kills: [kill(owner.steamId, victim.steamId)] }));
      expect((await owner.call('PUT', '/api/me/privacy', { isPrivate: true })).statusCode).toBe(
        204,
      );

      const anonymous = await statsOf(owner.account.publicId);
      const otherPlayer = await visitor.call(
        'GET',
        `/api/profiles/${owner.account.publicId}/stats`,
      );
      const own = await owner.call('GET', `/api/profiles/${owner.account.publicId}/stats`);

      expect(anonymous).toEqual({ visible: false, total: null, modes: [] });
      expect(profileStatsSchema.parse(otherPlayer.json()).visible).toBe(false);
      expect(profileStatsSchema.parse(own.json())).toMatchObject({
        visible: true,
        total: { kills: 1 },
      });
    });
  });

  it('responde 404 para ID que não existe', async () => {
    expect((await t.app.inject({ url: '/api/profiles/9999999/stats' })).statusCode).toBe(404);
    expect((await t.app.inject({ url: '/api/profiles/abc/stats' })).statusCode).toBe(404);
    expect((await t.app.inject({ url: '/api/profiles/9999999/stats/weekly' })).statusCode).toBe(
      404,
    );
    expect((await t.app.inject({ url: '/api/profiles/abc/stats/weekly' })).statusCode).toBe(404);
  });

  describe('Série semanal do Perfil (V3)', () => {
    const currentWeek = () => weekStartOf(new Date());
    /** A segunda-feira de `count` semanas antes da atual (dentro das 8 da série). */
    const weeksAgo = (count: number) => {
      const week = seriesWeeks(currentWeek())[PROFILE_SERIES_WEEKS - 1 - count];
      if (!week) throw new Error('semana fora da série');
      return week;
    };

    const weeklyOf = async (publicId: number, cookie?: string) => {
      const response = await t.app.inject({
        url: `/api/profiles/${publicId}/stats/weekly`,
        ...(cookie && { headers: { cookie } }),
      });
      expect(response.statusCode, response.body).toBe(200);
      return profileSeriesSchema.parse(response.json());
    };

    /** Grava uma linha do agregado semanal, como a ingestão de eventos a escreve. */
    const seed = async (
      accountId: string,
      mode: 'retake' | 'deathmatch',
      weekStart: string,
      counts: Partial<typeof accountStatsWeekly.$inferInsert>,
    ) => {
      await t.postgres.db
        .insert(accountStatsWeekly)
        .values({ accountId, mode, weekStart, ...counts });
    };

    it('uma Conta sem atividade tem as 8 semanas zeradas, sem inventar nada', async () => {
      const p = await player();

      const series = await weeklyOf(p.account.publicId);

      expect(series.visible).toBe(true);
      expect(series.weeks).toHaveLength(PROFILE_SERIES_WEEKS);
      expect(series.weeks.at(-1)?.weekStart).toBe(currentWeek());
      expect(series.weeks.every((w) => w.kills === 0 && w.headshotPercent === null)).toBe(true);
      expect(series.firstWeek).toBeNull();
      expect(series.hours?.total.every((m) => m.secondsPlayed === 0)).toBe(true);
    });

    it('traz as semanas do agregado, as horas por Modo e a primeira semana', async () => {
      const p = await player();
      await seed(p.account.id, 'retake', currentWeek(), {
        kills: 8,
        deaths: 4,
        headshots: 2,
        roundsPlayed: 55,
        secondsPlayed: 3600,
      });
      await seed(p.account.id, 'deathmatch', currentWeek(), { kills: 2, secondsPlayed: 600 });
      await seed(p.account.id, 'retake', weeksAgo(3), {
        kills: 5,
        deaths: 5,
        roundsPlayed: 20,
        secondsPlayed: 1800,
      });
      // Fora das 8 semanas: não entra na série, mas conta no total e na primeira semana.
      await seed(p.account.id, 'deathmatch', '2020-01-06', { secondsPlayed: 7200 });

      const series = await weeklyOf(p.account.publicId);

      expect(series.weeks.at(-1)).toMatchObject({
        weekStart: currentWeek(),
        rounds: 55,
        kills: 10,
        deaths: 4,
        kd: 2.5,
        headshotPercent: 20,
        secondsPlayed: 4200,
      });
      expect(series.weeks.at(-1)?.modes.map((m) => [m.mode, m.kills])).toEqual([
        ['retake', 8],
        ['deathmatch', 2],
      ]);
      expect(series.weeks.find((w) => w.weekStart === weeksAgo(3))).toMatchObject({
        rounds: 20,
        kd: 1,
      });
      expect(series.hours).toEqual({
        week: [
          { mode: 'retake', secondsPlayed: 3600 },
          { mode: 'deathmatch', secondsPlayed: 600 },
        ],
        total: [
          { mode: 'retake', secondsPlayed: 5400 },
          { mode: 'deathmatch', secondsPlayed: 7800 },
        ],
      });
      expect(series.firstWeek).toBe('2020-01-06');
    });

    it('bate com as somas do endpoint de Estatísticas', async () => {
      const killer = await player();
      const victim = await player();
      await send(batch({ kills: [kill(killer.steamId, victim.steamId, { headshot: true })] }));

      const series = await weeklyOf(killer.account.publicId);
      const stats = await statsOf(killer.account.publicId);

      expect(series.weeks.at(-1)).toMatchObject({
        kills: stats.total?.kills,
        deaths: stats.total?.deaths,
        kd: stats.total?.kd,
        headshotPercent: stats.total?.headshotPercent,
      });
    });

    it('Perfil privado: só a própria Conta vê a série', async () => {
      const owner = await player();
      const visitor = await player();
      await seed(owner.account.id, 'retake', currentWeek(), { kills: 3, secondsPlayed: 900 });
      expect((await owner.call('PUT', '/api/me/privacy', { isPrivate: true })).statusCode).toBe(
        204,
      );
      const url = `/api/profiles/${owner.account.publicId}/stats/weekly`;

      const anonymous = await weeklyOf(owner.account.publicId);
      const otherPlayer = await visitor.call('GET', url);
      const own = await owner.call('GET', url);

      expect(anonymous).toEqual({ visible: false, weeks: [], hours: null, firstWeek: null });
      expect(profileSeriesSchema.parse(otherPlayer.json())).toEqual(anonymous);
      expect(profileSeriesSchema.parse(own.json())).toMatchObject({
        visible: true,
        firstWeek: currentWeek(),
      });
    });
  });
});
