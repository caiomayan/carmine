import { type FriendsPlaying, friendsPlayingSchema, nowPlayingSchema } from '@carmine/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { FakeSteam } from './support/fake-steam.js';
import { signedInPlayer } from './support/player.js';

describe('Seus amigos jogando agora (S06)', () => {
  let t: TestApp;
  let steam: FakeSteam;

  beforeAll(async () => {
    steam = await FakeSteam.start();
    // Sem perfis na Steam falsa: o avatar fica nulo, sem corrida com a busca em segundo plano.
    steam.profilesExist = false;
    t = await startTestApp({
      STEAM_WEB_API_KEY: 'chave-de-teste',
      STEAM_WEB_API_URL: steam.url,
      STEAM_WEB_API_TIMEOUT_MS: '300',
    });
  });

  afterAll(async () => {
    await t?.stop();
    await steam?.stop();
  });

  beforeEach(() => {
    steam.behavior = 'ok';
  });

  /** Um jogador conecta no servidor (a Conta nasce) e o servidor manda o batimento com ele. */
  async function playing(serverKey: string, steamIds: string[]): Promise<void> {
    for (const steamId of steamIds) {
      const connect = await t.app.inject({
        method: 'POST',
        url: '/api/server/player-connects',
        headers: { authorization: `Bearer ${serverKey}` },
        payload: { steamId, steamName: `jogador-${steamId.slice(-3)}` },
      });
      expect(connect.statusCode, connect.body).toBe(200);
    }
    const heartbeat = await t.app.inject({
      method: 'POST',
      url: '/api/server/heartbeat',
      headers: { authorization: `Bearer ${serverKey}` },
      payload: { map: 'de_mirage', players: steamIds, maxPlayers: 9 },
    });
    expect(heartbeat.statusCode, heartbeat.body).toBe(200);
  }

  async function friendsPlaying(player: Awaited<ReturnType<typeof signedInPlayer>>) {
    const response = await player.call('GET', '/api/me/friends-playing');
    expect(response.statusCode, response.body).toBe(200);
    return friendsPlayingSchema.parse(response.json()) as FriendsPlaying;
  }

  it('sem sessão: 401', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/me/friends-playing' });

    expect(response.statusCode).toBe(401);
  });

  it('um amigo Steam conectado aparece, com o servidor onde está; quem não é amigo, não', async () => {
    const me = await signedInPlayer(t, 100);
    const friend = steamIdFor(101);
    const idleFriend = steamIdFor(102);
    const stranger = steamIdFor(103);
    steam.friendLists.set(me.steamId, [friend, idleFriend]);
    const { server, key } = await t.app
      .get(GameServerRegistry)
      .register({ name: 'retake-amigos', mode: 'retake', address: '127.0.0.1:27030' });
    await playing(key, [friend, stranger]);

    const result = await friendsPlaying(me);

    const account = await t.accounts.findBySteamId(friend);
    expect(result).toEqual({
      status: 'ok',
      friends: [
        {
          steamId: friend,
          publicId: account?.publicId,
          displayName: account?.displayName,
          avatarUrl: null,
          serverId: server.id,
        },
      ],
    });
  });

  it('sem amigo jogando: ok com a lista vazia (também para quem não tem amigos)', async () => {
    const me = await signedInPlayer(t, 110);
    const lonely = await signedInPlayer(t, 111);
    steam.friendLists.set(me.steamId, [steamIdFor(112)]);

    expect(await friendsPlaying(me)).toEqual({ status: 'ok', friends: [] });
    expect(await friendsPlaying(lonely)).toEqual({ status: 'ok', friends: [] });
  });

  it('lista própria pública: não consulta a lista de quem está jogando', async () => {
    const me = await signedInPlayer(t, 260);
    const friend = steamIdFor(261);
    const other = steamIdFor(262);
    steam.friendLists.set(me.steamId, [friend]);
    steam.friendLists.set(other, [me.steamId]);
    const { key } = await t.app
      .get(GameServerRegistry)
      .register({ name: 'retake-publica', mode: 'retake', address: '127.0.0.1:27032' });
    await playing(key, [friend, other]);

    const result = await friendsPlaying(me);

    expect(result.status === 'ok' && result.friends.map((f) => f.steamId)).toEqual([friend]);
    expect(steam.friendListRequestsFor(other)).toHaveLength(0);
    expect(steam.friendListRequestsFor(friend)).toHaveLength(0);
  });

  describe('lista de amigos privada na Steam', () => {
    it('acha o jogador que tem a Conta na lista dele, com o servidor onde está', async () => {
      const me = await signedInPlayer(t, 120);
      const mutual = steamIdFor(121);
      const oneWay = steamIdFor(122);
      steam.friendLists.set(me.steamId, 'private');
      steam.friendLists.set(mutual, [steamIdFor(129), me.steamId]);
      // Sem a Conta de quem olha na lista dele, não é amizade mútua: não aparece.
      steam.friendLists.set(oneWay, [steamIdFor(129)]);
      const { server, key } = await t.app
        .get(GameServerRegistry)
        .register({ name: 'retake-privada', mode: 'retake', address: '127.0.0.1:27033' });
      await playing(key, [mutual, oneWay]);

      const result = await friendsPlaying(me);

      const account = await t.accounts.findBySteamId(mutual);
      expect(result).toEqual({
        status: 'private',
        friends: [
          {
            steamId: mutual,
            publicId: account?.publicId,
            displayName: account?.displayName,
            avatarUrl: null,
            serverId: server.id,
          },
        ],
      });
    });

    it('ninguém jogando tem a Conta na lista: private com a lista vazia', async () => {
      const me = await signedInPlayer(t, 123);
      const other = steamIdFor(124);
      steam.friendLists.set(me.steamId, 'private');
      steam.friendLists.set(other, [steamIdFor(129)]);
      const { key } = await t.app
        .get(GameServerRegistry)
        .register({ name: 'retake-ninguem', mode: 'retake', address: '127.0.0.1:27034' });
      await playing(key, [other]);

      expect(await friendsPlaying(me)).toEqual({ status: 'private', friends: [] });
    });

    it('sem ninguém jogando: private com a lista vazia', async () => {
      const me = await signedInPlayer(t, 125);
      steam.friendLists.set(me.steamId, 'private');

      expect(await friendsPlaying(me)).toEqual({ status: 'private', friends: [] });
    });

    it('amigo que também tem a lista privada não aparece', async () => {
      const me = await signedInPlayer(t, 126);
      const friend = steamIdFor(127);
      steam.friendLists.set(me.steamId, 'private');
      steam.friendLists.set(friend, 'private');
      const { key } = await t.app
        .get(GameServerRegistry)
        .register({ name: 'retake-duas-privadas', mode: 'retake', address: '127.0.0.1:27035' });
      await playing(key, [friend]);

      expect(await friendsPlaying(me)).toEqual({ status: 'private', friends: [] });
    });

    it('as listas dos jogadores ficam em cache: a Steam é consultada uma vez por jogador', async () => {
      const me = await signedInPlayer(t, 170);
      const friend = steamIdFor(171);
      steam.friendLists.set(me.steamId, 'private');
      steam.friendLists.set(friend, [me.steamId]);
      const { key } = await t.app
        .get(GameServerRegistry)
        .register({ name: 'retake-cache-privada', mode: 'retake', address: '127.0.0.1:27036' });
      await playing(key, [friend]);

      const first = await friendsPlaying(me);
      const second = await friendsPlaying(me);

      expect(first.status === 'private' && first.friends.map((f) => f.steamId)).toEqual([friend]);
      expect(second).toEqual(first);
      expect(steam.friendListRequestsFor(friend)).toHaveLength(1);
      expect(steam.friendListRequestsFor(me.steamId)).toHaveLength(1);
    });
  });

  it.each([
    ['falha', 'error'],
    ['não responde', 'hang'],
  ] as const)('quando a Steam %s: unavailable', async (_, behavior) => {
    const me = await signedInPlayer(t, behavior === 'error' ? 130 : 131);
    steam.behavior = behavior;

    expect(await friendsPlaying(me)).toEqual({ status: 'unavailable' });
  });

  it('a lista de amigos fica em cache: a Steam é consultada uma vez, a presença é sempre a atual', async () => {
    const me = await signedInPlayer(t, 140);
    const friend = steamIdFor(141);
    steam.friendLists.set(me.steamId, [friend]);
    const { key } = await t.app
      .get(GameServerRegistry)
      .register({ name: 'retake-cache', mode: 'retake', address: '127.0.0.1:27031' });

    expect(await friendsPlaying(me)).toEqual({ status: 'ok', friends: [] });
    await playing(key, [friend]);
    const second = await friendsPlaying(me);

    expect(second.status === 'ok' && second.friends.map((f) => f.steamId)).toEqual([friend]);
    expect(steam.friendListRequestsFor(me.steamId)).toHaveLength(1);
    expect(steam.friendListRequestsFor(me.steamId)[0]?.searchParams.get('key')).toBe(
      'chave-de-teste',
    );
  });

  describe('onde a própria Conta está jogando (menu da Conta)', () => {
    it('sem sessão: 401', async () => {
      const response = await t.app.inject({ method: 'GET', url: '/api/me/playing' });

      expect(response.statusCode).toBe(401);
    });

    it('conectada num servidor: devolve nome, Modo e mapa dele, sem endereço nem lotação', async () => {
      const me = await signedInPlayer(t, 160);
      const { server, key } = await t.app.get(GameServerRegistry).register({
        name: 'retake-menu',
        mode: 'retake',
        address: '127.0.0.1:27040',
      });
      await playing(key, [me.steamId]);

      const response = await me.call('GET', '/api/me/playing');

      expect(response.statusCode, response.body).toBe(200);
      expect(nowPlayingSchema.parse(response.json())).toEqual({
        server: {
          id: server.id,
          name: 'retake-menu',
          showcaseName: null,
          mode: 'retake',
          map: 'de_mirage',
        },
      });
      expect(response.body).not.toContain('127.0.0.1');
    });

    it('fora de qualquer servidor: server nulo', async () => {
      const me = await signedInPlayer(t, 161);

      const response = await me.call('GET', '/api/me/playing');

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toEqual({ server: null });
    });
  });
});

describe('Seus amigos jogando agora, sem chave da Steam Web API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp({ STEAM_WEB_API_KEY: '' });
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('responde unavailable', async () => {
    const me = await signedInPlayer(t, 150);

    const response = await me.call('GET', '/api/me/friends-playing');

    expect(response.json()).toEqual({ status: 'unavailable' });
  });
});
