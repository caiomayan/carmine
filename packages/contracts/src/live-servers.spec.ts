import { describe, expect, it } from 'vitest';
import {
  friendsPlayingSchema,
  liveServerListSchema,
  nowPlayingSchema,
  serverHeartbeatSchema,
} from './live-servers.js';

const STEAM_ID = '76561198000000001';
const SERVER_ID = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';

describe('serverHeartbeatSchema', () => {
  it('aceita o estado do servidor com os SteamID64 conectados', () => {
    const heartbeat = { map: 'de_mirage', players: [STEAM_ID], maxPlayers: 9 };

    expect(serverHeartbeatSchema.parse(heartbeat)).toEqual(heartbeat);
  });

  it('aceita um servidor vazio', () => {
    expect(
      serverHeartbeatSchema.safeParse({ map: 'de_inferno', players: [], maxPlayers: 16 }),
    ).toMatchObject({ success: true });
  });

  it('rejeita mapa vazio, SteamID inválido e capacidade zero', () => {
    expect(serverHeartbeatSchema.safeParse({ map: ' ', players: [], maxPlayers: 9 }).success).toBe(
      false,
    );
    expect(
      serverHeartbeatSchema.safeParse({ map: 'de_dust2', players: ['123'], maxPlayers: 9 }).success,
    ).toBe(false);
    expect(
      serverHeartbeatSchema.safeParse({ map: 'de_dust2', players: [], maxPlayers: 0 }).success,
    ).toBe(false);
  });
});

describe('liveServerListSchema', () => {
  it('aceita um servidor online e um que nunca mandou batimento', () => {
    const list = {
      servers: [
        {
          id: SERVER_ID,
          name: 'retake-1',
          showcaseName: 'Retake · Rotação',
          code: 'SP·1',
          mode: 'retake',
          address: '203.0.113.10:27015',
          region: 'sao-paulo',
          map: 'de_mirage',
          players: 9,
          maxPlayers: 9,
          state: 'full',
          lastHeartbeatAt: '2026-10-12T18:00:00.000Z',
        },
        {
          id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
          name: 'dm-1',
          showcaseName: null,
          code: null,
          mode: 'deathmatch',
          address: '203.0.113.10:27016',
          region: 'sao-paulo',
          map: null,
          players: 0,
          maxPlayers: 16,
          state: 'offline',
          lastHeartbeatAt: null,
        },
      ],
      summary: { online: 1, players: 9 },
      generatedAt: '2026-10-12T18:00:01.000Z',
    };

    expect(liveServerListSchema.parse(list)).toEqual(list);
  });
});

describe('friendsPlayingSchema', () => {
  it('distingue os três estados', () => {
    const playing = {
      status: 'ok',
      friends: [
        {
          steamId: STEAM_ID,
          publicId: 10_003,
          displayName: 'fallen',
          avatarUrl: null,
          serverId: SERVER_ID,
        },
      ],
    };

    expect(friendsPlayingSchema.parse(playing)).toEqual(playing);
    expect(friendsPlayingSchema.parse({ status: 'ok', friends: [] })).toEqual({
      status: 'ok',
      friends: [],
    });
    expect(friendsPlayingSchema.parse({ status: 'private' })).toEqual({ status: 'private' });
    expect(friendsPlayingSchema.parse({ status: 'unavailable' })).toEqual({
      status: 'unavailable',
    });
    expect(friendsPlayingSchema.safeParse({ status: 'erro' }).success).toBe(false);
  });
});

describe('nowPlayingSchema', () => {
  it('diz onde a Conta está jogando, ou nulo quando não está em nenhum servidor', () => {
    const playing = {
      server: {
        id: SERVER_ID,
        name: 'retake-1',
        showcaseName: 'Retake · Rotação',
        mode: 'retake',
        map: 'de_mirage',
      },
    };

    expect(nowPlayingSchema.parse(playing)).toEqual(playing);
    expect(nowPlayingSchema.parse({ server: null })).toEqual({ server: null });
  });

  it('não carrega o endereço nem a lotação do servidor, só o que o menu mostra', () => {
    const parsed = nowPlayingSchema.parse({
      server: {
        id: SERVER_ID,
        name: 'retake-1',
        showcaseName: null,
        mode: 'retake',
        map: null,
        address: '203.0.113.10:27015',
        players: 9,
      },
    });

    expect(parsed.server).toEqual({
      id: SERVER_ID,
      name: 'retake-1',
      showcaseName: null,
      mode: 'retake',
      map: null,
    });
  });
});
