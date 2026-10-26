import { profileLocationSchema, profilePlayingSchema, profileSchema } from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

describe('Perfil público', () => {
  let t: TestApp;
  let publicId: number;
  const steamId = steamIdFor(1);

  beforeAll(async () => {
    t = await startTestApp();
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName: 'coldzera' },
    });
    publicId = response.json<{ publicId: number }>().publicId;
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('GET /api/profiles/{publicId} mostra o Perfil de uma Conta não reivindicada', async () => {
    const response = await t.app.inject({ url: `/api/profiles/${publicId}` });

    expect(response.statusCode).toBe(200);
    expect(profileSchema.parse(response.json())).toEqual({
      publicId,
      displayName: 'coldzera',
      avatarUrl: null,
      steamId,
      steamProfileUrl: `https://steamcommunity.com/profiles/${steamId}`,
      claimed: false,
      memberSince: expect.any(String),
      isVip: false,
      loadoutShowcase: { items: [] },
      sanctions: { active: [], history: null },
      isPrivate: false,
    });
  });

  it.each([
    ['9999999', 'ID que não existe'],
    ['abc', 'não é número'],
    ['010016', 'zero à esquerda'],
    ['1'.repeat(30), 'grande demais'],
  ])('/%s responde 404 (%s)', async (id) => {
    const response = await t.app.inject({ url: `/api/profiles/${id}` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ statusCode: 404, message: 'Perfil não encontrado' });
  });

  it('resolve o SteamID64 de uma Conta para o ID público (o web redireciona com 301)', async () => {
    const response = await t.app.inject({ url: `/api/profiles/by-steam-id/${steamId}` });

    expect(response.statusCode).toBe(200);
    expect(profileLocationSchema.parse(response.json())).toEqual({ publicId });
  });

  it('um SteamID64 válido sem Conta responde 404', async () => {
    const response = await t.app.inject({ url: `/api/profiles/by-steam-id/${steamIdFor(999)}` });

    expect(response.statusCode).toBe(404);
  });

  it('um SteamID64 inválido responde 400', async () => {
    const response = await t.app.inject({ url: '/api/profiles/by-steam-id/123' });

    expect(response.statusCode).toBe(400);
  });

  it('memberSince é quando a Conta nasceu', async () => {
    const before = Date.now();
    const player = await signedInPlayer(t, 2);

    const response = await t.app.inject({ url: `/api/profiles/${player.account.publicId}` });

    const { memberSince } = profileSchema.parse(response.json());
    expect(new Date(memberSince).getTime()).toBe(player.account.createdAt.getTime());
    expect(new Date(memberSince).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('o selo VIP vale só com Período ativo, também para um visitante sem sessão', async () => {
    const vip = await signedInPlayer(t, 3, { vipUntil: Date.now() + 5 * 24 * 60 * 60 * 1000 });
    const expired = await signedInPlayer(t, 4, { vipUntil: Date.now() - 1000 });
    const plain = await signedInPlayer(t, 5);
    const isVip = async (publicId: number) =>
      profileSchema.parse((await t.app.inject({ url: `/api/profiles/${publicId}` })).json()).isVip;

    expect(await isVip(vip.account.publicId)).toBe(true);
    expect(await isVip(expired.account.publicId)).toBe(false);
    expect(await isVip(plain.account.publicId)).toBe(false);
    // Na sessão, a mesma Conta vê o selo e o fim do Período em campos separados.
    const me = (await vip.call('GET', '/api/me')).json();
    expect(me.account.isVip).toBe(true);
    expect(me.vip.active).toBe(true);
  });

  it('o Perfil privado continua mostrando ID, entrada e selo VIP', async () => {
    const player = await signedInPlayer(t, 6, { vipUntil: Date.now() + 24 * 60 * 60 * 1000 });
    await player.call('PUT', '/api/me/privacy', { isPrivate: true });

    const response = await t.app.inject({ url: `/api/profiles/${player.account.publicId}` });

    expect(profileSchema.parse(response.json())).toMatchObject({
      publicId: player.account.publicId,
      isPrivate: true,
      isVip: true,
      memberSince: player.account.createdAt.toISOString(),
    });
  });

  describe('GET /api/profiles/{publicId}/playing', () => {
    const playingOf = async (publicId: number) => {
      const response = await t.app.inject({ url: `/api/profiles/${publicId}/playing` });
      expect(response.statusCode, response.body).toBe(200);
      return profilePlayingSchema.parse(response.json());
    };

    it('sem servidor: server nulo', async () => {
      const player = await signedInPlayer(t, 10);

      expect(await playingOf(player.account.publicId)).toEqual({ server: null });
    });

    it('jogando: o servidor com endereço, mapa e estado, sem sessão e também no Perfil privado', async () => {
      const player = await signedInPlayer(t, 11);
      await player.call('PUT', '/api/me/privacy', { isPrivate: true });
      const { server, key } = await t.app
        .get(GameServerRegistry)
        .register({ name: 'retake-perfil', mode: 'retake', address: '127.0.0.1:27040' });
      const heartbeat = await t.app.inject({
        method: 'POST',
        url: '/api/server/heartbeat',
        headers: { authorization: `Bearer ${key}` },
        payload: { map: 'de_inferno', players: [player.steamId], maxPlayers: 9 },
      });
      expect(heartbeat.statusCode, heartbeat.body).toBe(200);

      expect(await playingOf(player.account.publicId)).toEqual({
        server: {
          id: server.id,
          name: 'retake-perfil',
          showcaseName: null,
          mode: 'retake',
          map: 'de_inferno',
          address: '127.0.0.1:27040',
          state: 'online',
        },
      });
    });

    it.each(['9999999', 'abc', '010016'])('/%s responde 404', async (id) => {
      const response = await t.app.inject({ url: `/api/profiles/${id}/playing` });

      expect(response.statusCode).toBe(404);
    });
  });

  it('não expõe dados internos da Conta', async () => {
    const response = await t.app.inject({ url: `/api/profiles/${publicId}` });

    expect(Object.keys(response.json()).sort()).toEqual(Object.keys(profileSchema.shape).sort());
  });
});
