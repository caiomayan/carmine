import { describe, expect, it } from 'vitest';
import { buildLiveServerList, type ListedServer, type ServerPresence } from './live-server-list.js';

const now = new Date('2026-10-12T18:00:00.000Z');
const secondsAgo = (seconds: number) => new Date(now.getTime() - seconds * 1000);

const retake: ListedServer = {
  id: '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102',
  name: 'retake-1',
  showcaseName: 'Retake · Rotação',
  code: 'SP·1',
  mode: 'retake',
  address: '203.0.113.10:27015',
  region: 'sao-paulo',
};
const deathmatch: ListedServer = {
  id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  name: 'dm-1',
  showcaseName: null,
  code: null,
  mode: 'deathmatch',
  address: '203.0.113.10:27016',
  region: 'sao-paulo',
};

const presence = (overrides: Partial<ServerPresence> = {}): ServerPresence => ({
  map: 'de_mirage',
  players: ['76561198000000001', '76561198000000002'],
  maxPlayers: 9,
  at: secondsAgo(5),
  ...overrides,
});

describe('buildLiveServerList', () => {
  it('servidor com batimento recente e vaga livre está online, com mapa e jogadores', () => {
    const list = buildLiveServerList([retake], new Map([[retake.id, presence()]]), now);

    expect(list.servers).toEqual([
      {
        ...retake,
        map: 'de_mirage',
        players: 2,
        maxPlayers: 9,
        state: 'online',
        lastHeartbeatAt: '2026-10-12T17:59:55.000Z',
        lastMap: 'de_mirage',
        match: null,
      },
    ]);
    expect(list.summary).toEqual({ online: 1, players: 2 });
    expect(list.generatedAt).toBe('2026-10-12T18:00:00.000Z');
  });

  it('com todas as vagas públicas ocupadas está lotado (e acima delas também)', () => {
    const nine = Array.from({ length: 9 }, (_, i) => `7656119800000001${i}`);
    const full = buildLiveServerList(
      [retake],
      new Map([[retake.id, presence({ players: nine })]]),
      now,
    );
    const overflow = buildLiveServerList(
      [retake],
      new Map([[retake.id, presence({ players: [...nine, '76561198000000099'] })]]),
      now,
    );

    expect(full.servers[0]?.state).toBe('full');
    expect(overflow.servers[0]).toMatchObject({ state: 'full', players: 10, maxPlayers: 9 });
    expect(overflow.summary).toEqual({ online: 1, players: 10 });
  });

  it('sem batimento há 45 s fica offline: sem mapa nem jogadores, mas com o último batimento e o último mapa', () => {
    const list = buildLiveServerList(
      [retake],
      new Map([[retake.id, presence({ at: secondsAgo(45), maxPlayers: 10 })]]),
      now,
    );

    expect(list.servers[0]).toMatchObject({
      map: null,
      players: 0,
      maxPlayers: 10,
      state: 'offline',
      lastHeartbeatAt: '2026-10-12T17:59:15.000Z',
      lastMap: 'de_mirage',
    });
    expect(list.summary).toEqual({ online: 0, players: 0 });
  });

  it('com batimento há 44 s ainda está online', () => {
    const list = buildLiveServerList(
      [retake],
      new Map([[retake.id, presence({ at: secondsAgo(44) })]]),
      now,
    );

    expect(list.servers[0]?.state).toBe('online');
  });

  it('um servidor que nunca mandou batimento está offline com as vagas padrão do Modo', () => {
    const list = buildLiveServerList([deathmatch, retake], new Map(), now);

    expect(
      list.servers.map((s) => [s.name, s.state, s.maxPlayers, s.lastHeartbeatAt, s.lastMap]),
    ).toEqual([
      ['retake-1', 'offline', 9, null, null],
      ['dm-1', 'offline', 16, null, null],
    ]);
  });

  it('ordena por Modo (Retake, depois Deathmatch) e nome, e soma o rodapé', () => {
    const retake2 = { ...retake, id: '2c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'retake-2' };
    const list = buildLiveServerList(
      [deathmatch, retake2, retake],
      new Map([
        [deathmatch.id, presence({ players: ['76561198000000003'], maxPlayers: 16 })],
        [retake2.id, presence()],
      ]),
      now,
    );

    expect(list.servers.map((s) => s.name)).toEqual(['retake-1', 'retake-2', 'dm-1']);
    expect(list.summary).toEqual({ online: 2, players: 3 });
  });

  it('S12b: o placar de times vai junto enquanto o servidor está no ar e some quando cai', () => {
    const match = { round: 15, ctScore: 8, tScore: 6, warmup: false };
    const up = buildLiveServerList([retake], new Map([[retake.id, presence({ match })]]), now);
    const down = buildLiveServerList(
      [retake],
      new Map([[retake.id, presence({ match, at: secondsAgo(60) })]]),
      now,
    );

    expect(up.servers[0]?.match).toEqual(match);
    expect(down.servers[0]).toMatchObject({ state: 'offline', match: null });
  });

  it('S12b: sem placar (Deathmatch, plugin antigo) o match é nulo', () => {
    const list = buildLiveServerList(
      [deathmatch],
      new Map([[deathmatch.id, presence({ match: null, scoreboard: [] })]]),
      now,
    );

    expect(list.servers[0]?.match).toBeNull();
  });
});
