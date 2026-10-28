import { type GameMode, type HeaderPreviews, headerPreviewsSchema } from '@carmine/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { accountStatsWeekly } from '../src/database/schema.js';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { weekStartOf } from '../src/stats/stats-week.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { FakeSteam } from './support/fake-steam.js';
import { signedInPlayer } from './support/player.js';
import { installStableClock } from './support/stable-clock.js';

// Antes de qualquer `new Date()` do arquivo: sem cruzar a meia-noite de Brasília durante o teste.
installStableClock();

const THIS_WEEK = weekStartOf(new Date());

/** Ids da @ianlucas/cs2-lib 9.5.0. */
const BAYONET = 1211;
const AK_REDLINE = 222;
const AWP_ASIIMOV = 306;
const M4A1S = 1089; // só CT

describe('Prévias do header (U3e)', () => {
  let t: TestApp;
  let steam: FakeSteam;
  let next = 1;
  let port = 27100;

  beforeAll(async () => {
    steam = await FakeSteam.start();
    steam.profilesExist = false;
    t = await startTestApp({
      STEAM_WEB_API_KEY: 'chave-de-teste',
      STEAM_WEB_API_URL: steam.url,
      STEAM_WEB_API_TIMEOUT_MS: '300',
      HEADER_PREVIEWS_CACHE_TTL_SECONDS: '0',
      RANKING_CACHE_TTL_SECONDS: '0',
    });
  });

  afterAll(async () => {
    await t?.stop();
    await steam?.stop();
  });

  beforeEach(async () => {
    steam.behavior = 'ok';
    // A presença dos servidores mora no Valkey: esvaziá-lo deixa todo servidor offline.
    await t.valkey.executeCliCmd('flushall');
  });

  const player = (options: { vip?: boolean } = {}) =>
    signedInPlayer(t, 500 + next++, options.vip ? { vipUntil: Date.now() + 30 * 86_400_000 } : {});
  type Player = Awaited<ReturnType<typeof player>>;

  /** Registra um servidor e manda o batimento com esses jogadores (as Contas nascem no connect). */
  async function server(
    name: string,
    mode: GameMode,
    steamIds: string[],
    maxPlayers = 9,
  ): Promise<{ id: string; key: string }> {
    const { server: registered, key } = await t.app
      .get(GameServerRegistry)
      .register({ name, mode, address: `127.0.0.1:${port++}` });
    for (const steamId of steamIds) {
      const connect = await t.app.inject({
        method: 'POST',
        url: '/api/server/player-connects',
        headers: { authorization: `Bearer ${key}` },
        payload: { steamId, steamName: `jogador-${steamId.slice(-3)}` },
      });
      expect(connect.statusCode, connect.body).toBe(200);
    }
    const heartbeat = await t.app.inject({
      method: 'POST',
      url: '/api/server/heartbeat',
      headers: { authorization: `Bearer ${key}` },
      payload: { map: 'de_mirage', players: steamIds, maxPlayers },
    });
    expect(heartbeat.statusCode, heartbeat.body).toBe(200);
    return { id: registered.id, key };
  }

  /** `n` SteamID64 novos, cada um de uma Conta que ainda não existe. */
  const strangers = (count: number) =>
    Array.from({ length: count }, () => steamIdFor(9000 + next++));

  const seed = (
    who: Player,
    mode: GameMode,
    over: Partial<typeof accountStatsWeekly.$inferInsert>,
  ) =>
    t.postgres.db.insert(accountStatsWeekly).values({
      accountId: who.account.id,
      mode,
      weekStart: THIS_WEEK,
      roundsPlayed: 60,
      secondsPlayed: 2400,
      ...over,
    });

  async function previews(who?: Player, query = '') {
    const response = who
      ? await who.call('GET', `/api/header-previews${query}`)
      : await t.app.inject({ url: `/api/header-previews${query}` });
    expect(response.statusCode, response.body).toBe(200);
    return { response, body: headerPreviewsSchema.parse(response.json()) as HeaderPreviews };
  }

  describe('visitante', () => {
    it('recebe só a parte pública: servidor mais cheio, sem Loadout nem Inventário, e Top 3', async () => {
      const first = await player();
      const second = await player();
      const third = await player();
      await seed(first, 'retake', { roundsPlayed: 900, roundsWon: 900 });
      await seed(second, 'retake', { roundsPlayed: 900, roundsWon: 800 });
      await seed(third, 'retake', { roundsPlayed: 900, roundsWon: 700 });
      const quiet = await server('visit-vazio', 'retake', strangers(1));
      const busy = await server('visit-cheio', 'deathmatch', strangers(5));

      const { response, body } = await previews();

      expect(body.signedIn).toBe(false);
      expect(body.loadout).toBeNull();
      expect(body.inventory).toBeNull();
      expect(body.play.friendsPlaying).toBeNull();
      expect(body.play.recommended).toMatchObject({
        server: { id: busy.id, players: 5 },
        reason: 'fullest',
        friends: [],
      });
      expect(body.play.others.map((s) => s.id)).toEqual([quiet.id]);
      const retake = body.ranking?.modes.find((mode) => mode.mode === 'retake');
      expect(retake?.top.map((entry) => entry.player.publicId)).toEqual([
        first.account.publicId,
        second.account.publicId,
        third.account.publicId,
      ]);
      expect(retake?.mine).toBeNull();
      expect(body.ranking).toMatchObject({ weekStart: THIS_WEEK });
      expect(response.headers['cache-control']).toBe('public, max-age=10');
      expect(response.headers.vary).toContain('Cookie');
    });

    it('sem nenhum servidor no ar: nada recomendado', async () => {
      const { body } = await previews();

      expect(body.play).toEqual({ recommended: null, others: [], friendsPlaying: null });
    });

    it('o fim da semana vem como instante: segunda-feira 00:00 de Brasília', async () => {
      const { body } = await previews();

      const closes = new Date(body.ranking?.closesAt ?? '');
      expect(closes.getUTCDay()).toBe(1);
      expect(closes.getUTCHours()).toBe(3);
      expect(weekStartOf(new Date(closes.getTime() - 1))).toBe(THIS_WEEK);
    });
  });

  describe('com sessão', () => {
    it('traz o Inventário (total e os 4 mais novos), o Loadout do lado e Cache-Control private', async () => {
      const me = await player({ vip: true });
      const knife = await me.add({ id: BAYONET });
      const ak = await me.add({ id: AK_REDLINE, statTrak: 0 });
      const awp = await me.add({ id: AWP_ASIIMOV });
      await me.equip(knife);
      await me.equip(ak);
      await me.equip(awp);
      for (let i = 0; i < 3; i++) await me.add({ id: AK_REDLINE });

      const { response, body } = await previews(me, '?side=t');

      expect(body.signedIn).toBe(true);
      expect(body.inventory?.total).toBe(6);
      expect(body.inventory?.latest).toHaveLength(4);
      expect(body.inventory?.latest.map((item) => item.uid)).not.toContain(knife);
      expect(body.loadout).toMatchObject({ side: 't', presetName: 'Principal' });
      expect(body.loadout?.slots).toEqual([
        { slot: 'knife', itemId: BAYONET, uid: knife, statTrak: false },
        { slot: 'gloves', itemId: null, uid: null, statTrak: false },
        { slot: 'weapon_ak47', itemId: AK_REDLINE, uid: ak, statTrak: true },
        { slot: 'weapon_awp', itemId: AWP_ASIIMOV, uid: awp, statTrak: false },
      ]);
      expect(response.headers['cache-control']).toBe('private, max-age=10');
      expect(response.headers.vary).toContain('Cookie');
    });

    it('sem "side" o lado é CT: o rifle é a M4A4 (padrão) ou a M4A1-S quando equipada', async () => {
      const me = await player();
      const { body: before } = await previews(me);
      const m4a1s = await me.add({ id: M4A1S });
      await me.equip(m4a1s, ['ct']);

      const { body: after } = await previews(me);

      expect(before.loadout?.side).toBe('ct');
      expect(before.loadout?.slots[2]).toMatchObject({ slot: 'weapon_m4a1', uid: null });
      expect(after.loadout?.slots[2]).toMatchObject({
        slot: 'weapon_m4a1_silencer',
        itemId: M4A1S,
        uid: m4a1s,
      });
    });

    it('Inventário vazio: total 0 e nada recente', async () => {
      const me = await player();

      const { body } = await previews(me);

      expect(body.inventory).toEqual({ total: 0, limit: 300, latest: [] });
    });

    it('a minha posição em cada Modo, ou o que falta para o mínimo', async () => {
      const me = await player();
      await seed(me, 'deathmatch', { secondsPlayed: 3 * 3600, kills: 400, deaths: 100 });
      await seed(me, 'retake', { roundsPlayed: 38, roundsWon: 30 });

      const { body } = await previews(me);

      const mine = Object.fromEntries(
        (body.ranking?.modes ?? []).map((mode) => [mode.mode, mode.mine]),
      );
      expect(mine.deathmatch?.position).toBeGreaterThan(0);
      expect(mine.deathmatch?.progress).toBeNull();
      expect(mine.retake).toEqual({
        position: null,
        progress: { unit: 'rounds', missing: 12 },
      });
    });
  });

  describe('servidor recomendado', () => {
    it('onde estão os amigos, com eles; o total de amigos jogando vem junto', async () => {
      const me = await player();
      const friendSteamId = steamIdFor(700 + next++);
      steam.friendLists.set(me.steamId, [friendSteamId]);
      const crowded = await server('amigos-cheio', 'deathmatch', strangers(7));
      const withFriend = await server('amigos-aqui', 'retake', [friendSteamId, ...strangers(1)]);

      const { body } = await previews(me);

      const friend = await t.accounts.findBySteamId(friendSteamId);
      expect(body.play.recommended).toMatchObject({
        server: { id: withFriend.id },
        reason: 'friends',
      });
      expect(body.play.recommended?.friends.map((f) => f.publicId)).toEqual([friend?.publicId]);
      expect(body.play.friendsPlaying).toBe(1);
      expect(body.play.others.map((s) => s.id)).toEqual([crowded.id]);
    });

    it('com a lista de amigos privada, os amigos achados pelas listas deles também valem', async () => {
      const me = await player();
      const friendSteamId = steamIdFor(700 + next++);
      steam.friendLists.set(me.steamId, 'private');
      steam.friendLists.set(friendSteamId, [me.steamId]);
      await server('privada-cheio', 'deathmatch', strangers(6));
      const withFriend = await server('privada-aqui', 'retake', [friendSteamId]);

      const { body } = await previews(me);

      expect(body.play.recommended).toMatchObject({
        server: { id: withFriend.id },
        reason: 'friends',
      });
      expect(body.play.friendsPlaying).toBe(1);
    });

    it('sem amigos jogando: o Modo em que a pessoa mais joga, com mais gente', async () => {
      const me = await player();
      await seed(me, 'deathmatch', { secondsPlayed: 20 * 3600 });
      await seed(me, 'retake', { secondsPlayed: 3600 });
      await server('modo-retake-cheio', 'retake', strangers(8));
      const dmSmall = await server('modo-dm-pouco', 'deathmatch', strangers(2));
      const dmBusy = await server('modo-dm-mais', 'deathmatch', strangers(4));

      const { body } = await previews(me);

      expect(body.play.recommended).toMatchObject({
        server: { id: dmBusy.id },
        reason: 'favorite_mode',
      });
      expect(body.play.others.map((s) => s.id)).toContain(dmSmall.id);
    });

    it('lotado só é recomendado se for a única opção', async () => {
      const full = await server('lotado-cheio', 'retake', strangers(9));
      const open = await server('lotado-vaga', 'retake', strangers(3));

      const { body } = await previews();

      expect(body.play.recommended?.server.id).toBe(open.id);
      expect(body.play.others.map((s) => s.id)).toEqual([full.id]);
    });
  });

  describe('quando uma fonte falha', () => {
    it('Steam fora: o endpoint responde 200, sem amigos, e o resto da prévia segue', async () => {
      const me = await player();
      steam.behavior = 'error';
      await me.add({ id: AK_REDLINE });
      const busy = await server('steam-fora', 'retake', strangers(4));

      const { body } = await previews(me);

      expect(body.play.friendsPlaying).toBeNull();
      expect(body.play.recommended).toMatchObject({ server: { id: busy.id }, reason: 'fullest' });
      expect(body.inventory?.total).toBe(1);
      expect(body.ranking).not.toBeNull();
    });
  });
});

describe('Prévias do header (U3e), com cache', () => {
  let t: TestApp;
  let steam: FakeSteam;

  beforeAll(async () => {
    steam = await FakeSteam.start();
    steam.profilesExist = false;
    t = await startTestApp({
      STEAM_WEB_API_KEY: 'chave-de-teste',
      STEAM_WEB_API_URL: steam.url,
      STEAM_WEB_API_TIMEOUT_MS: '300',
      HEADER_PREVIEWS_CACHE_TTL_SECONDS: '60',
    });
  });

  afterAll(async () => {
    await t?.stop();
    await steam?.stop();
  });

  beforeEach(async () => {
    steam.behavior = 'ok';
    await t.valkey.executeCliCmd('flushall');
  });

  const read = async (
    who: { call: (m: 'GET', url: string) => ReturnType<TestApp['app']['inject']> },
    query = '',
  ) => headerPreviewsSchema.parse((await who.call('GET', `/api/header-previews${query}`)).json());

  async function live(name: string, port: number, steamIds: string[]) {
    const { key } = await t.app
      .get(GameServerRegistry)
      .register({ name, mode: 'retake', address: `127.0.0.1:${port}` });
    for (const steamId of steamIds) {
      await t.app.inject({
        method: 'POST',
        url: '/api/server/player-connects',
        headers: { authorization: `Bearer ${key}` },
        payload: { steamId, steamName: `jogador-${steamId.slice(-3)}` },
      });
    }
    await t.app.inject({
      method: 'POST',
      url: '/api/server/heartbeat',
      headers: { authorization: `Bearer ${key}` },
      payload: { map: 'de_mirage', players: steamIds, maxPlayers: 9 },
    });
  }

  it('Jogar e Ranking ficam em cache por Conta, mas Inventário e Loadout saem sempre frescos', async () => {
    const me = await signedInPlayer(t, 3001);
    const other = await signedInPlayer(t, 3002);
    await me.add({ id: AK_REDLINE });
    await live('cache-1', 27301, [steamIdFor(3101)]);

    const first = await read(me);
    await live('cache-2', 27302, [steamIdFor(3102), steamIdFor(3103), steamIdFor(3104)]);
    await me.add({ id: AK_REDLINE });
    const second = await read(me);
    const others = await read(other);

    // O painel Jogar repete (o servidor novo ainda não apareceu), o Inventário não.
    expect(second.play).toEqual(first.play);
    expect(first.inventory?.total).toBe(1);
    expect(second.inventory?.total).toBe(2);
    // Cada Conta tem o seu cache: a outra Conta já vê os dois servidores.
    expect(others.play.recommended?.server.name).toBe('cache-2');
  });

  it('o visitante tem um cache só, compartilhado', async () => {
    await live('anon-1', 27311, [steamIdFor(3111)]);
    const anonymous = () => t.app.inject({ url: '/api/header-previews' });

    const first = headerPreviewsSchema.parse((await anonymous()).json());
    await live('anon-2', 27312, [steamIdFor(3112), steamIdFor(3113)]);
    const second = headerPreviewsSchema.parse((await anonymous()).json());

    expect(second.play).toEqual(first.play);
    expect(first.play.recommended?.server.name).toBe('anon-1');
  });

  it('o lado muda o retrato do Loadout sem esperar o cache', async () => {
    const me = await signedInPlayer(t, 3003);

    const ct = await read(me, '?side=ct');
    const tr = await read(me, '?side=t');

    expect(ct.loadout?.side).toBe('ct');
    expect(tr.loadout?.side).toBe('t');
  });

  it('resposta com a Steam fora não vai para o cache: os amigos voltam quando ela volta', async () => {
    const me = await signedInPlayer(t, 3004);
    const friendSteamId = steamIdFor(3201);
    steam.friendLists.set(me.steamId, [friendSteamId]);
    await live('degradada', 27321, [friendSteamId]);

    steam.behavior = 'error';
    const during = await read(me);
    steam.behavior = 'ok';
    // A lista da Steam também fica 15 s no cache das listas: limpar só a dela.
    await t.valkey.executeCliCmd('del', [`steam:friends:${me.steamId}`]);
    const after = await read(me);

    expect(during.play.friendsPlaying).toBeNull();
    expect(after.play.friendsPlaying).toBe(1);
    expect(after.play.recommended?.reason).toBe('friends');
  });
});
