import { describe, expect, it } from 'vitest';
import type { Database } from '../database/database.js';
import type { LiveServers } from '../live-servers/live-servers.js';
import type { CachedFriendLists, FriendListLookup } from './cached-friend-lists.js';
import { FriendsPlayingFinder } from './friends-playing.js';

const steamIdFor = (n: number) => String(76561198000000000n + BigInt(n));
const SERVER = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';
const VIEWER = steamIdFor(1);

/** Listas fixas por SteamID; quem não está aqui tem a Steam fora. Guarda quem foi consultado. */
class FakeLists {
  readonly asked: string[] = [];
  constructor(private readonly lists: Record<string, FriendListLookup>) {}
  of = async (steamId: string): Promise<FriendListLookup> => {
    this.asked.push(steamId);
    return this.lists[steamId] ?? { status: 'unavailable' };
  };
}

/** A presença: SteamID64 → servidor, para os dois jeitos de perguntar. */
function fakeLive(playing: Record<string, string>) {
  const all = () => new Map(Object.entries(playing));
  return {
    playingNow: async () => all(),
    whereArePlaying: async (steamIds: Iterable<string>) => {
      const wanted = new Set(steamIds);
      return new Map([...all()].filter(([steamId]) => wanted.has(steamId)));
    },
  } as unknown as LiveServers;
}

/** O Postgres: devolve uma Conta para cada SteamID de `known`, qualquer que seja o filtro. */
function fakeDb(known: string[]) {
  const rows = known.map((steamId) => ({
    steamId: BigInt(steamId),
    publicId: Number(BigInt(steamId) % 1000n) + 1000,
    displayName: `nome-${steamId.slice(-3)}`,
    avatarUrl: null,
  }));
  return { select: () => ({ from: () => ({ where: async () => rows }) }) } as unknown as Database;
}

function finderWith(
  lists: Record<string, FriendListLookup>,
  playing: Record<string, string>,
  accounts: string[] = Object.keys(playing),
) {
  const fake = new FakeLists(lists);
  const finder = new FriendsPlayingFinder(
    fake as unknown as CachedFriendLists,
    fakeLive(playing),
    fakeDb(accounts),
  );
  return { finder, fake };
}

describe('FriendsPlayingFinder', () => {
  describe('com a lista de amigos da Conta visível', () => {
    it('cruza a lista dela com a presença, sem consultar a lista de mais ninguém', async () => {
      const friend = steamIdFor(2);
      const { finder, fake } = finderWith(
        { [VIEWER]: { status: 'ok', steamIds: [friend, steamIdFor(3)] } },
        { [friend]: SERVER, [steamIdFor(4)]: SERVER },
        [friend],
      );

      const result = await finder.of(VIEWER);

      expect(result.status).toBe('ok');
      expect(result.status === 'ok' && result.friends.map((f) => f.steamId)).toEqual([friend]);
      expect(fake.asked).toEqual([VIEWER]);
    });

    it('ninguém jogando: ok com a lista vazia', async () => {
      const { finder } = finderWith({ [VIEWER]: { status: 'ok', steamIds: [steamIdFor(2)] } }, {});

      expect(await finder.of(VIEWER)).toEqual({ status: 'ok', friends: [] });
    });
  });

  describe('com a lista de amigos da Conta privada', () => {
    it('acha o jogador que tem a Conta na própria lista, com o servidor dele', async () => {
      const friend = steamIdFor(2);
      const stranger = steamIdFor(3);
      const { finder } = finderWith(
        {
          [VIEWER]: { status: 'private' },
          [friend]: { status: 'ok', steamIds: [steamIdFor(9), VIEWER] },
          [stranger]: { status: 'ok', steamIds: [steamIdFor(9)] },
        },
        { [friend]: SERVER, [stranger]: SERVER },
        [friend],
      );

      const result = await finder.of(VIEWER);

      expect(result.status).toBe('private');
      expect(result.status === 'private' && result.friends).toEqual([
        expect.objectContaining({ steamId: friend, serverId: SERVER, displayName: 'nome-002' }),
      ]);
    });

    it('ninguém achado: private com a lista vazia', async () => {
      const other = steamIdFor(2);
      const { finder } = finderWith(
        { [VIEWER]: { status: 'private' }, [other]: { status: 'ok', steamIds: [] } },
        { [other]: SERVER },
      );

      expect(await finder.of(VIEWER)).toEqual({ status: 'private', friends: [] });
    });

    it('ninguém jogando: nem consulta a lista de ninguém', async () => {
      const { finder, fake } = finderWith({ [VIEWER]: { status: 'private' } }, {});

      expect(await finder.of(VIEWER)).toEqual({ status: 'private', friends: [] });
      expect(fake.asked).toEqual([VIEWER]);
    });

    it('amigo com a lista também privada (ou sem resposta) não aparece', async () => {
      const privateOne = steamIdFor(2);
      const downOne = steamIdFor(3);
      const { finder } = finderWith(
        {
          [VIEWER]: { status: 'private' },
          [privateOne]: { status: 'private' },
          [downOne]: { status: 'unavailable' },
        },
        { [privateOne]: SERVER, [downOne]: SERVER },
      );

      expect(await finder.of(VIEWER)).toEqual({ status: 'private', friends: [] });
    });

    it('a própria Conta jogando não é consultada nem aparece', async () => {
      const { finder, fake } = finderWith(
        { [VIEWER]: { status: 'private' } },
        { [VIEWER]: SERVER },
      );

      expect(await finder.of(VIEWER)).toEqual({ status: 'private', friends: [] });
      expect(fake.asked).toEqual([VIEWER]);
    });

    it('ordena os achados pelo nome', async () => {
      const [a, b, c] = [steamIdFor(5), steamIdFor(3), steamIdFor(4)] as [string, string, string];
      const mutual: FriendListLookup = { status: 'ok', steamIds: [VIEWER] };
      const { finder } = finderWith(
        { [VIEWER]: { status: 'private' }, [a]: mutual, [b]: mutual, [c]: mutual },
        { [a]: SERVER, [b]: SERVER, [c]: SERVER },
        [a, b, c],
      );

      const result = await finder.of(VIEWER);

      expect(result.status === 'private' && result.friends.map((f) => f.steamId)).toEqual([
        b,
        c,
        a,
      ]);
    });

    it('limita as consultas simultâneas à Steam e para ao primeiro erro', async () => {
      const players = Array.from({ length: 40 }, (_, i) => steamIdFor(10 + i));
      let running = 0;
      let peak = 0;
      const asked: string[] = [];
      const lists = {
        of: async (steamId: string): Promise<FriendListLookup> => {
          if (steamId === VIEWER) return { status: 'private' };
          asked.push(steamId);
          running++;
          peak = Math.max(peak, running);
          await new Promise((resolve) => setTimeout(resolve, 5));
          running--;
          return { status: 'unavailable' };
        },
      };
      const finder = new FriendsPlayingFinder(
        lists as unknown as CachedFriendLists,
        fakeLive(Object.fromEntries(players.map((p) => [p, SERVER]))),
        fakeDb([]),
      );

      expect(await finder.of(VIEWER)).toEqual({ status: 'private', friends: [] });
      expect(peak).toBeLessThanOrEqual(6);
      // A Steam fora (ou limitando): quem já estava a caminho termina, ninguém novo começa.
      expect(asked.length).toBeLessThanOrEqual(6);
    });
  });

  it('Steam fora para a lista da Conta: unavailable, sem olhar a presença dos outros', async () => {
    const { finder, fake } = finderWith(
      { [VIEWER]: { status: 'unavailable' } },
      { [steamIdFor(2)]: SERVER },
    );

    expect(await finder.of(VIEWER)).toEqual({ status: 'unavailable' });
    expect(fake.asked).toEqual([VIEWER]);
  });
});
