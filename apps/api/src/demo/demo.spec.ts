import {
  eventBatchSchema,
  RETAKE_MIN_ROUNDS,
  serverHeartbeatSchema,
  steamId64Schema,
} from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { DEMO_PLAYERS, DEMO_SERVERS, demoServerKey, playersOf } from './demo-cast.js';
import { assertDemoDatabase, DemoNotAllowed, demoSettings } from './demo-guard.js';
import { currentWeekFraction, demoWeeks, weekStatsOf } from './demo-history.js';
import { createSimServer, tick } from './demo-match.js';
import { seeded, uuidFor } from './demo-random.js';

const SECRET = 'a'.repeat(48);
const HOMOLOGACAO = {
  CARMINE_DEMO: 'homologacao',
  PUBLIC_WEB_URL: 'https://dev.stcarmine.com',
  SENTRY_ENVIRONMENT: 'staging',
  DEMO_SEED_SECRET: SECRET,
};

describe('a trava da demonstração', () => {
  it('libera na homologação', () => {
    expect(demoSettings(HOMOLOGACAO)).toEqual({
      secret: SECRET,
      ownerSteamId: null,
      publicWebUrl: 'https://dev.stcarmine.com',
    });
    expect(demoSettings({ ...HOMOLOGACAO, PUBLIC_WEB_URL: 'http://localhost:3000' }).secret).toBe(
      SECRET,
    );
  });

  it('recusa a produção, em qualquer das quatro chaves', () => {
    const recusas: Array<Record<string, string | undefined>> = [
      { ...HOMOLOGACAO, PUBLIC_WEB_URL: 'https://stcarmine.com' },
      { ...HOMOLOGACAO, PUBLIC_WEB_URL: 'https://www.stcarmine.com' },
      { ...HOMOLOGACAO, PUBLIC_WEB_URL: 'https://dev.stcarmine.com.evil.example' },
      { ...HOMOLOGACAO, PUBLIC_WEB_URL: undefined },
      { ...HOMOLOGACAO, CARMINE_DEMO: undefined },
      { ...HOMOLOGACAO, CARMINE_DEMO: '1' },
      { ...HOMOLOGACAO, SENTRY_ENVIRONMENT: 'production' },
      { ...HOMOLOGACAO, SENTRY_ENVIRONMENT: ' Production ' },
      { ...HOMOLOGACAO, DEMO_SEED_SECRET: undefined },
      { ...HOMOLOGACAO, DEMO_SEED_SECRET: 'curto' },
      {},
    ];
    for (const env of recusas) {
      expect(() => demoSettings(env), JSON.stringify(env)).toThrow(DemoNotAllowed);
    }
  });

  it('confere o SteamID64 do dono', () => {
    const owner = DEMO_PLAYERS[0]?.steamId as string;
    expect(demoSettings({ ...HOMOLOGACAO, DEMO_OWNER_STEAM_ID: owner }).ownerSteamId).toBe(owner);
    expect(demoSettings({ ...HOMOLOGACAO, DEMO_OWNER_STEAM_ID: '  ' }).ownerSteamId).toBeNull();
    expect(() => demoSettings({ ...HOMOLOGACAO, DEMO_OWNER_STEAM_ID: '123' })).toThrow(
      DemoNotAllowed,
    );
  });

  it('recusa um banco com servidor de verdade', () => {
    const demo = new Set(DEMO_SERVERS.map((server) => server.name));
    expect(() => assertDemoDatabase(['retake-1', 'dm-1'], demo)).not.toThrow();
    expect(() => assertDemoDatabase([], demo)).not.toThrow();
    expect(() => assertDemoDatabase(['retake-1', 'retake-sp-01'], demo)).toThrow(/retake-sp-01/);
  });
});

describe('o elenco fictício', () => {
  it('tem SteamID64 válidos, únicos e nomes únicos', () => {
    const ids = DEMO_PLAYERS.map((player) => player.steamId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(steamId64Schema.safeParse(id).success, id).toBe(true);
    expect(new Set(DEMO_PLAYERS.map((player) => player.name)).size).toBe(DEMO_PLAYERS.length);
  });

  it('cada servidor tem jogadores de sobra para a lotação que simula', () => {
    for (const server of DEMO_SERVERS) {
      expect(playersOf(server.name).length, server.name).toBeGreaterThanOrEqual(server.online.max);
      expect(server.online.max).toBeLessThanOrEqual(server.maxPlayers);
    }
  });

  it('deriva chaves estáveis no formato das de verdade, diferentes por servidor e por segredo', () => {
    const key = demoServerKey(SECRET, 'retake-1');
    expect(key).toMatch(/^cmk_[A-Za-z0-9_-]{43}$/);
    expect(demoServerKey(SECRET, 'retake-1')).toBe(key);
    expect(demoServerKey(SECRET, 'retake-2')).not.toBe(key);
    expect(demoServerKey('b'.repeat(48), 'retake-1')).not.toBe(key);
  });
});

describe('o histórico semanal', () => {
  const now = new Date('2026-10-28T15:00:00Z'); // quarta-feira
  const weeks = demoWeeks(now);

  it('lista a semana atual e as três anteriores, da segunda-feira', () => {
    expect(weeks).toEqual(['2026-10-26', '2026-10-19', '2026-10-12', '2026-10-05']);
  });

  it('é o mesmo a cada execução (a mesma semente, os mesmos números)', () => {
    const player = DEMO_PLAYERS[0];
    if (!player) throw new Error('sem elenco');
    expect(weekStatsOf(player, weeks[1] as string, 1, false)).toEqual(
      weekStatsOf(player, weeks[1] as string, 1, false),
    );
  });

  it('põe boa parte do elenco acima do mínimo do Ranking na semana atual', () => {
    const fraction = currentWeekFraction(now);
    const retake = DEMO_PLAYERS.filter((player) => player.home.startsWith('retake'));
    const eligible = retake.filter(
      (player) =>
        (weekStatsOf(player, weeks[0] as string, fraction, true)?.roundsPlayed ?? 0) >=
        RETAKE_MIN_ROUNDS,
    );
    expect(eligible.length).toBeGreaterThanOrEqual(Math.ceil(retake.length * 0.8));
  });

  it('gera contagens coerentes', () => {
    for (const player of DEMO_PLAYERS) {
      for (const [back, week] of weeks.entries()) {
        const stats = weekStatsOf(player, week, 1, back === 0);
        if (!stats) continue;
        expect(stats.headshots).toBeLessThanOrEqual(stats.kills);
        expect(stats.roundsWon).toBeLessThanOrEqual(stats.roundsPlayed);
        for (const value of Object.values(stats)) {
          if (typeof value === 'number') expect(value).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe('o simulador de partidas', () => {
  it('manda batimentos e lotes que o contrato da API aceita, e respeita as vagas', () => {
    const random = seeded('teste');
    let counter = 0;
    const newId = () => uuidFor(`teste:${counter++}`);
    const start = new Date('2026-10-28T15:00:00Z').getTime();

    for (const def of DEMO_SERVERS) {
      const state = createSimServer(def, new Date(start), random);
      let events = 0;
      for (let step = 0; step < 400; step++) {
        const { heartbeat, batch } = tick(state, new Date(start + step * 10_000), random, newId);
        expect(serverHeartbeatSchema.safeParse(heartbeat).success, def.name).toBe(true);
        expect(heartbeat.players.length).toBeLessThanOrEqual(def.maxPlayers);
        expect(heartbeat.players.length).toBeGreaterThanOrEqual(step === 0 ? 1 : def.online.min);
        if (batch) {
          const parsed = eventBatchSchema.safeParse(batch);
          expect(parsed.success, `${def.name}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
          events += batch.kills.length;
        }
      }
      expect(events, `${def.name} jogou`).toBeGreaterThan(20);
    }
  });

  it('o servidor lotado fica lotado', () => {
    const random = seeded('lotado');
    const def = DEMO_SERVERS.find((server) => server.name === 'retake-2');
    if (!def) throw new Error('sem retake-2');
    const state = createSimServer(def, new Date(0), random);
    const sizes = new Set<number>();
    for (let step = 0; step < 200; step++) {
      const { heartbeat } = tick(state, new Date(step * 10_000), random, () =>
        uuidFor(String(step)),
      );
      sizes.add(heartbeat.players.length);
    }
    expect(sizes.has(9)).toBe(true);
  });

  it('cada Sessão que termina começou antes', () => {
    const random = seeded('sessoes');
    let n = 0;
    const def = DEMO_SERVERS[0];
    if (!def) throw new Error('sem servidor');
    const state = createSimServer(def, new Date(0), random);
    const started = new Map<string, number>();
    for (let step = 0; step < 300; step++) {
      const at = new Date(step * 10_000);
      const { batch } = tick(state, at, random, () => uuidFor(`s:${n++}`));
      for (const start of batch?.sessionStarts ?? []) started.set(start.sessionId, step);
      for (const end of batch?.sessionEnds ?? []) {
        expect(started.has(end.sessionId)).toBe(true);
        expect(new Date(end.at).getTime()).toBeGreaterThan(new Date(end.startedAt).getTime() - 1);
      }
    }
  });
});
