import { type FriendsPlaying, friendsPlayingSchema } from '@carmine/contracts';
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

  it('lista de amigos privada na Steam: private', async () => {
    const me = await signedInPlayer(t, 120);
    steam.friendLists.set(me.steamId, 'private');

    expect(await friendsPlaying(me)).toEqual({ status: 'private' });
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
