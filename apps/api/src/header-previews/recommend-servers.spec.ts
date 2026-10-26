import type { LiveServer, PlayingFriend } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { recommendServers } from './recommend-servers.js';

let counter = 0;
const server = (over: Partial<LiveServer> = {}): LiveServer => {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    name: `servidor-${counter}`,
    showcaseName: null,
    code: null,
    mode: 'retake',
    address: `203.0.113.10:${27000 + counter}`,
    region: 'sao-paulo',
    map: 'de_mirage',
    players: 0,
    maxPlayers: 9,
    state: 'online',
    lastHeartbeatAt: '2026-10-22T18:00:00.000Z',
    lastMap: 'de_mirage',
    ...over,
  };
};

const friend = (serverId: string, n = 1): PlayingFriend => ({
  steamId: `7656119800000000${n}`,
  publicId: 10_000 + n,
  displayName: `amigo-${n}`,
  avatarUrl: null,
  serverId,
});

describe('recommendServers', () => {
  it('sem nenhum servidor no ar: nada recomendado, nem outros', () => {
    const offline = server({ state: 'offline', map: null });

    expect(recommendServers({ servers: [offline], friends: [], favoriteMode: null })).toEqual({
      recommended: null,
      others: [],
    });
    expect(recommendServers({ servers: [], friends: [], favoriteMode: 'retake' })).toEqual({
      recommended: null,
      others: [],
    });
  });

  describe('sem amigos e sem Modo preferido (ou deslogado): o mais cheio', () => {
    it('escolhe o servidor com mais jogadores', () => {
      const empty = server({ players: 1 });
      const busy = server({ players: 7 });

      const { recommended } = recommendServers({
        servers: [empty, busy],
        friends: [],
        favoriteMode: null,
      });

      expect(recommended).toMatchObject({ server: busy, reason: 'fullest', friends: [] });
    });

    it('prefere um servidor com vaga a um lotado, mesmo com menos jogadores', () => {
      const full = server({ players: 9, state: 'full' });
      const open = server({ players: 5 });

      const { recommended } = recommendServers({
        servers: [full, open],
        friends: [],
        favoriteMode: null,
      });

      expect(recommended?.server).toBe(open);
    });

    it('com todos lotados, recomenda o mais cheio mesmo assim (o VIP entra pela vaga reservada)', () => {
      const a = server({ players: 9, maxPlayers: 9, state: 'full' });
      const b = server({ players: 10, maxPlayers: 10, state: 'full' });

      const { recommended } = recommendServers({
        servers: [a, b],
        friends: [],
        favoriteMode: null,
      });

      expect(recommended?.server).toBe(b);
    });

    it('empate de jogadores: o nome decide, sempre o mesmo', () => {
      const first = server({ name: 'a-retake', players: 4 });
      const second = server({ name: 'b-retake', players: 4 });

      expect(
        recommendServers({ servers: [second, first], friends: [], favoriteMode: null }).recommended
          ?.server,
      ).toBe(first);
    });

    it('servidor offline nunca é recomendado, nem aparece nos outros', () => {
      const offline = server({ state: 'offline', players: 0, map: null });
      const online = server({ players: 2 });

      const result = recommendServers({
        servers: [offline, online],
        friends: [],
        favoriteMode: null,
      });

      expect(result.recommended?.server).toBe(online);
      expect(result.others).toEqual([]);
    });
  });

  describe('com o Modo que a pessoa mais joga', () => {
    it('recomenda o servidor mais cheio daquele Modo, ainda que haja outro mais cheio em outro', () => {
      const retakeBusy = server({ mode: 'retake', players: 8 });
      const dm = server({ mode: 'deathmatch', players: 3 });
      const dmBusier = server({ mode: 'deathmatch', players: 5 });

      const { recommended } = recommendServers({
        servers: [retakeBusy, dm, dmBusier],
        friends: [],
        favoriteMode: 'deathmatch',
      });

      expect(recommended).toMatchObject({ server: dmBusier, reason: 'favorite_mode' });
    });

    it('sem servidor no ar daquele Modo, cai no mais cheio', () => {
      const retake = server({ mode: 'retake', players: 4 });
      const dmOffline = server({ mode: 'deathmatch', state: 'offline', map: null });

      const { recommended } = recommendServers({
        servers: [retake, dmOffline],
        friends: [],
        favoriteMode: 'deathmatch',
      });

      expect(recommended).toMatchObject({ server: retake, reason: 'fullest' });
    });
  });

  describe('com amigos jogando', () => {
    it('os amigos vencem o Modo preferido e o mais cheio, e vêm junto', () => {
      const withFriends = server({ mode: 'retake', players: 2 });
      const busy = server({ mode: 'deathmatch', players: 8 });
      const friends = [friend(withFriends.id, 1), friend(withFriends.id, 2)];

      const { recommended } = recommendServers({
        servers: [busy, withFriends],
        friends,
        favoriteMode: 'deathmatch',
      });

      expect(recommended).toMatchObject({ server: withFriends, reason: 'friends', friends });
    });

    it('vai ao servidor com mais amigos', () => {
      const one = server({ players: 8 });
      const two = server({ players: 2 });
      const friends = [friend(one.id, 1), friend(two.id, 2), friend(two.id, 3)];

      const { recommended } = recommendServers({
        servers: [one, two],
        friends,
        favoriteMode: null,
      });

      expect(recommended?.server).toBe(two);
      expect(recommended?.friends.map((f) => f.publicId)).toEqual([10_002, 10_003]);
    });

    it('empate de amigos: o que tem vaga, depois o mais cheio', () => {
      const full = server({ players: 9, state: 'full' });
      const open = server({ players: 3 });
      const friends = [friend(full.id, 1), friend(open.id, 2)];

      const { recommended } = recommendServers({
        servers: [full, open],
        friends,
        favoriteMode: null,
      });

      expect(recommended?.server).toBe(open);
    });

    it('amigo num servidor lotado ainda é o recomendado, se não há outro com amigos', () => {
      const full = server({ players: 9, state: 'full' });
      const open = server({ players: 5 });

      const { recommended } = recommendServers({
        servers: [open, full],
        friends: [friend(full.id)],
        favoriteMode: null,
      });

      expect(recommended).toMatchObject({ server: full, reason: 'friends' });
    });

    it('amigo num servidor que saiu da lista ou está offline não conta', () => {
      const offline = server({ state: 'offline', map: null });
      const online = server({ players: 1 });

      const { recommended } = recommendServers({
        servers: [offline, online],
        friends: [friend(offline.id), friend('ffffffff-ffff-4fff-8fff-ffffffffffff', 2)],
        favoriteMode: null,
      });

      expect(recommended).toMatchObject({ server: online, reason: 'fullest', friends: [] });
    });
  });

  describe('os outros servidores', () => {
    it('até 3, sem o recomendado, do mais cheio ao menos cheio', () => {
      const servers = [1, 2, 3, 4, 5].map((players) => server({ players }));

      const { recommended, others } = recommendServers({
        servers,
        friends: [],
        favoriteMode: null,
      });

      expect(recommended?.server.players).toBe(5);
      expect(others.map((s) => s.players)).toEqual([4, 3, 2]);
    });

    it('lotados também entram, ordenados por jogadores', () => {
      const open = server({ players: 6 });
      const full = server({ players: 9, state: 'full' });
      const top = server({ players: 8 });

      const { recommended, others } = recommendServers({
        servers: [open, full, top],
        friends: [],
        favoriteMode: null,
      });

      expect(recommended?.server).toBe(top);
      expect(others.map((s) => s.players)).toEqual([9, 6]);
    });
  });
});
