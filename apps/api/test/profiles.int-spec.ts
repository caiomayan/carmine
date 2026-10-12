import { profileLocationSchema, profileSchema } from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

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
      loadoutShowcase: { items: [] },
      sanctions: { active: [], history: [] },
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

  it('não expõe dados internos da Conta', async () => {
    const response = await t.app.inject({ url: `/api/profiles/${publicId}` });

    expect(Object.keys(response.json()).sort()).toEqual(Object.keys(profileSchema.shape).sort());
  });
});
