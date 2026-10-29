import {
  liveServerListSchema,
  type ServerHeartbeat,
  serverPlayersSchema,
  serverTodaySchema,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accounts } from '../src/database/schema.js';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { dayOf } from '../src/stats/stats-week.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';
import { installStableClock } from './support/stable-clock.js';

// Antes de qualquer `new Date()` do arquivo: sem cruzar a meia-noite de Brasília durante o teste.
installStableClock();

const NOW = new Date();
const AT = NOW.toISOString();
const STRANGER = steamIdFor(777);

let seq = 0;
const eventId = () => `0199f2a0-7b1c-7000-8000-${String(++seq).padStart(12, '0')}`;

describe('A página do servidor (S12b, PR C)', () => {
  let t: TestApp;
  let retakeId: string;
  let dmKey: string;
  let dmId: string;
  let next = 1;

  beforeAll(async () => {
    t = await startTestApp();
    const registry = t.app.get(GameServerRegistry);
    const retake = (await registry.list()).find((server) => server.name === 'retake-teste');
    retakeId = retake?.id as string;
    const dm = await registry.register({
      name: 'dm-teste',
      mode: 'deathmatch',
      address: '127.0.0.1:27016',
    });
    dmKey = dm.key;
    dmId = dm.server.id;
  });

  afterAll(async () => {
    await t?.stop();
  });

  const player = async () => {
    const n = next++;
    await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId: steamIdFor(n), steamName: `jogador${n}` },
    });
    return signedInPlayer(t, n);
  };

  const beat = async (heartbeat: ServerHeartbeat | Record<string, unknown>, key = t.serverKey) => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/heartbeat',
      headers: { authorization: `Bearer ${key}` },
      payload: heartbeat,
    });
    expect(response.statusCode, response.body).toBe(200);
  };

  const events = async (payload: Record<string, unknown>, key = t.serverKey) => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/events',
      headers: { authorization: `Bearer ${key}` },
      payload: {
        kills: [],
        damages: [],
        roundEnds: [],
        sessionStarts: [],
        sessionEnds: [],
        ...payload,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
  };

  const players = async (id: string, cookie?: string) => {
    const response = await t.app.inject({
      url: `/api/servers/${id}/players`,
      ...(cookie && { headers: { cookie } }),
    });
    expect(response.statusCode, response.body).toBe(200);
    return serverPlayersSchema.parse(response.json());
  };

  describe('placar de times na lista ao vivo', () => {
    it('o match do batimento aparece em /api/servers e some no batimento seguinte sem ele', async () => {
      const match = { round: 15, ctScore: 8, tScore: 6, warmup: false };
      await beat({ map: 'de_mirage', players: [], maxPlayers: 9, match });
      const list = liveServerListSchema.parse((await t.app.inject({ url: '/api/servers' })).json());
      expect(list.servers.find((s) => s.id === retakeId)?.match).toEqual(match);

      await beat({ map: 'de_mirage', players: [], maxPlayers: 9 });
      const after = liveServerListSchema.parse(
        (await t.app.inject({ url: '/api/servers' })).json(),
      );
      expect(after.servers.find((s) => s.id === retakeId)?.match).toBeNull();
    });

    it('o Deathmatch não tem placar de times', async () => {
      await beat({ map: 'de_dust2', players: [], maxPlayers: 16, match: null }, dmKey);
      const list = liveServerListSchema.parse((await t.app.inject({ url: '/api/servers' })).json());
      expect(list.servers.find((s) => s.id === dmId)?.match).toBeNull();
    });
  });

  describe('GET /api/servers/{id}/players', () => {
    it('uma linha por jogador, ordenada pelo placar; privado e sem Conta viram "Jogador privado"', async () => {
      const a = await player();
      const b = await player();
      const hidden = await player();
      await t.postgres.db
        .update(accounts)
        .set({ profilePrivate: true })
        .where(eq(accounts.id, hidden.account.id));
      const match = { round: 3, ctScore: 1, tScore: 1, warmup: false };
      await beat({
        map: 'de_mirage',
        players: [a.steamId, b.steamId, hidden.steamId, STRANGER],
        maxPlayers: 9,
        match,
        scoreboard: [
          { steamId: a.steamId, team: 'ct', kills: 5, deaths: 2, score: 12 },
          { steamId: b.steamId, team: 't', kills: 9, deaths: 1, score: 20 },
          { steamId: hidden.steamId, team: 't', kills: 1, deaths: 4, score: 2 },
        ],
      });

      const body = await players(retakeId);

      expect(body).toMatchObject({
        serverId: retakeId,
        mode: 'retake',
        state: 'online',
        map: 'de_mirage',
        maxPlayers: 9,
        match,
        scoreboard: true,
      });
      expect(body.players).toHaveLength(4);
      // Pontos primeiro; quem não tem número (a presença sem placar) por último.
      expect(body.players.map((p) => p.score)).toEqual([20, 12, 2, null]);
      expect(body.players[0]).toMatchObject({
        player: {
          private: false,
          publicId: b.account.publicId,
          displayName: b.account.displayName,
        },
        team: 't',
        kills: 9,
        deaths: 1,
        self: false,
      });
      const privates = body.players.filter((p) => p.player.private);
      expect(privates).toHaveLength(2);
      for (const row of privates) {
        expect(row.player).toEqual({
          private: true,
          publicId: null,
          displayName: 'Jogador privado',
          avatarUrl: null,
        });
      }
      expect(body.players.every((p) => !p.self)).toBe(true);
      // O Perfil privado não vaza: nem o nome aparece em nenhum lugar.
      expect(JSON.stringify(body)).not.toContain(hidden.steamId);
    });

    it('quem está logado vê a própria linha marcada, inclusive com o Perfil privado', async () => {
      const me = await player();
      await t.postgres.db
        .update(accounts)
        .set({ profilePrivate: true })
        .where(eq(accounts.id, me.account.id));
      await beat({ map: 'de_mirage', players: [me.steamId], maxPlayers: 9 });
      const login = await me.call('GET', `/api/servers/${retakeId}/players`);
      const body = serverPlayersSchema.parse(login.json());

      expect(body.players).toHaveLength(1);
      expect(body.players[0]?.self).toBe(true);
      // A marca é só de quem pede; a identidade continua anônima.
      expect(body.players[0]?.player.private).toBe(true);
    });

    it('sem o placar por jogador (plugin antigo) os números vêm nulos e a ordem é pelo nome', async () => {
      const a = await player();
      const b = await player();
      await beat({ map: 'de_mirage', players: [b.steamId, a.steamId], maxPlayers: 9 });

      const body = await players(retakeId);

      expect(body.scoreboard).toBe(false);
      expect(body.players.map((p) => p.player.displayName)).toEqual(
        [...body.players.map((p) => p.player.displayName)].sort((x, y) => x.localeCompare(y)),
      );
      for (const row of body.players) {
        expect([row.team, row.kills, row.deaths, row.score]).toEqual([null, null, null, null]);
      }
    });

    it('Deathmatch: números por jogador com o time nulo', async () => {
      const a = await player();
      await beat(
        {
          map: 'de_dust2',
          players: [a.steamId],
          maxPlayers: 16,
          scoreboard: [{ steamId: a.steamId, kills: 20, deaths: 11, score: 20 }],
        },
        dmKey,
      );

      const body = await players(dmId);

      expect(body.mode).toBe('deathmatch');
      expect(body.match ?? null).toBeNull();
      expect(body.players[0]).toMatchObject({ team: null, kills: 20, deaths: 11, score: 20 });
    });

    it('servidor que nunca bateu está offline e sem jogadores; desconhecido é 404', async () => {
      const dm2 = await t.app
        .get(GameServerRegistry)
        .register({ name: 'dm-parado', mode: 'deathmatch', address: '127.0.0.1:27017' });

      const body = await players(dm2.server.id);

      expect(body).toMatchObject({
        state: 'offline',
        players: [],
        scoreboard: false,
        updatedAt: null,
      });
      expect((await t.app.inject({ url: `/api/servers/${eventId()}/players` })).statusCode).toBe(
        404,
      );
      expect((await t.app.inject({ url: '/api/servers/nao-e-uuid/players' })).statusCode).toBe(404);
    });
  });

  describe('GET /api/servers/{id}/today', () => {
    const today = async (id: string, query = '') => {
      const response = await t.app.inject({ url: `/api/servers/${id}/today${query}` });
      return { status: response.statusCode, body: response.json() };
    };

    it('Retake: rounds, vitórias, mapa com placar final, horas, pico e jogadores únicos', async () => {
      const a = await player();
      const b = await player();
      const sessionA = eventId();
      const sessionB = eventId();
      const round = (n: number, winner: 'ct' | 't') => ({
        id: eventId(),
        at: AT,
        warmup: false,
        winner,
        // Humanos dos dois lados: round de verdade (o sintético do cs2-retakes não conta).
        players: [
          { steamId: a.steamId, team: 'ct' as const },
          { steamId: b.steamId, team: 't' as const },
        ],
        map: 'de_ancient',
        roundNumber: n,
        scoreCt: n === 1 ? 1 : 1,
        scoreT: n === 1 ? 0 : 1,
      });
      await events({
        roundEnds: [round(1, 'ct'), round(2, 't')],
        sessionStarts: [
          { id: eventId(), at: AT, sessionId: sessionA, steamId: a.steamId, map: 'de_ancient' },
          { id: eventId(), at: AT, sessionId: sessionB, steamId: b.steamId, map: 'de_ancient' },
        ],
      });

      const { status, body } = await today(retakeId);
      expect(status).toBe(200);
      const parsed = serverTodaySchema.parse(body);

      expect(parsed).toMatchObject({
        serverId: retakeId,
        mode: 'retake',
        date: dayOf(NOW),
        isToday: true,
        since: dayOf(NOW),
      });
      expect(parsed.rounds).toEqual({ played: 2, ctWins: 1, tWins: 1 });
      expect(parsed.maps).toHaveLength(1);
      expect(parsed.maps[0]).toMatchObject({
        map: 'de_ancient',
        rounds: 2,
        ctWins: 1,
        tWins: 1,
        finalScore: { ct: 1, t: 1 },
      });
      expect(parsed.hours).toHaveLength(24);
      expect(parsed.hours.reduce((sum, h) => sum + h.rounds, 0)).toBe(2);
      expect(parsed.uniquePlayers).toBeGreaterThanOrEqual(2);
      expect(parsed.peakPlayers?.count).toBeGreaterThanOrEqual(2);
    });

    it('Deathmatch: sem rounds (nulo, não zero) e os mapas vêm das Sessões', async () => {
      const a = await player();
      const sessionId = eventId();
      await events(
        {
          sessionStarts: [
            { id: eventId(), at: AT, sessionId, steamId: a.steamId, map: 'de_dust2' },
          ],
          sessionEnds: [
            {
              id: eventId(),
              at: new Date(NOW.getTime() + 600_000).toISOString(),
              sessionId,
              steamId: a.steamId,
              startedAt: AT,
              maps: ['de_dust2', 'de_inferno'],
            },
          ],
        },
        dmKey,
      );

      const { status, body } = await today(dmId);
      expect(status).toBe(200);
      const parsed = serverTodaySchema.parse(body);

      expect(parsed.mode).toBe('deathmatch');
      expect(parsed.rounds).toBeNull();
      expect(parsed.maps.map((m) => m.map).sort()).toEqual(['de_dust2', 'de_inferno']);
      for (const map of parsed.maps) {
        expect([map.rounds, map.ctWins, map.tWins, map.finalScore]).toEqual([
          null,
          null,
          null,
          null,
        ]);
      }
      expect(parsed.uniquePlayers).toBe(1);
      expect(parsed.hours.reduce((sum, h) => sum + h.rounds, 0)).toBe(0);
    });

    it('um dia passado sem nada: horas zeradas e sem pico; o servidor sem nenhuma coleta tem rounds nulo', async () => {
      const dm3 = await t.app
        .get(GameServerRegistry)
        .register({ name: 'dm-vazio', mode: 'deathmatch', address: '127.0.0.1:27018' });
      const yesterday = dayOf(new Date(NOW.getTime() - 24 * 60 * 60 * 1000));

      const past = serverTodaySchema.parse((await today(retakeId, `?date=${yesterday}`)).body);
      expect(past).toMatchObject({
        date: yesterday,
        isToday: false,
        peakPlayers: null,
        uniquePlayers: null,
      });
      expect(past.hours.every((h) => h.rounds === 0 && h.players === 0)).toBe(true);
      expect(past.rounds).toEqual({ played: 0, ctWins: 0, tWins: 0 });

      const empty = serverTodaySchema.parse((await today(dm3.server.id)).body);
      expect(empty).toMatchObject({ since: null, rounds: null, maps: [], uniquePlayers: null });
    });

    it('valida a data e o servidor', async () => {
      const long = dayOf(new Date(NOW.getTime() - 9 * 24 * 60 * 60 * 1000));
      const tomorrow = dayOf(new Date(NOW.getTime() + 36 * 60 * 60 * 1000));
      for (const date of [long, tomorrow, '2026-02-30', 'ontem']) {
        expect((await today(retakeId, `?date=${date}`)).status, date).toBe(400);
      }
      expect((await today(eventId())).status).toBe(404);
      expect((await today('nao-e-uuid')).status).toBe(404);
    });
  });
});
