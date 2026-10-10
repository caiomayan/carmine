import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { FakeSteam } from './support/fake-steam.js';

describe('Avatar Steam da Conta', () => {
  let t: TestApp;
  let steam: FakeSteam;

  beforeAll(async () => {
    steam = await FakeSteam.start();
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

  async function connect(steamId: string) {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName: 'jogador' },
    });
    expect(response.statusCode, response.body).toBe(200);
  }

  it('busca o avatar na Steam depois do connect, com a chave da API', async () => {
    const steamId = steamIdFor(1);

    await connect(steamId);

    await vi.waitFor(async () => {
      expect((await t.accounts.findBySteamId(steamId))?.avatarUrl).toBe(
        FakeSteam.avatarUrlFor(steamId),
      );
    });
    expect(steam.requestsFor(steamId)[0]?.searchParams.get('key')).toBe('chave-de-teste');
  });

  it.each([
    ['falha', 'error'],
    ['não responde', 'hang'],
  ] as const)(
    'quando a Steam %s, o connect não espera, fica o avatar neutro e tenta de novo no próximo connect',
    async (_, behavior) => {
      const steamId = steamIdFor(behavior === 'error' ? 2 : 3);
      steam.behavior = behavior;

      const startedAt = performance.now();
      await connect(steamId);
      expect(performance.now() - startedAt).toBeLessThan(250);

      await vi.waitFor(() => expect(steam.requestsFor(steamId)).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 400)); // passa o timeout da Steam
      expect((await t.accounts.findBySteamId(steamId))?.avatarUrl).toBeNull();

      steam.behavior = 'ok';
      await connect(steamId);

      await vi.waitFor(async () => {
        expect((await t.accounts.findBySteamId(steamId))?.avatarUrl).toBe(
          FakeSteam.avatarUrlFor(steamId),
        );
      });
    },
  );

  it('não busca de novo um avatar recente', async () => {
    const steamId = steamIdFor(4);
    await connect(steamId);
    await vi.waitFor(async () => {
      expect((await t.accounts.findBySteamId(steamId))?.avatarUrl).not.toBeNull();
    });

    await connect(steamId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(steam.requestsFor(steamId)).toHaveLength(1);
  });
});

describe('Avatar Steam sem chave configurada', () => {
  let t: TestApp;
  let steam: FakeSteam;

  beforeAll(async () => {
    steam = await FakeSteam.start();
    t = await startTestApp({ STEAM_WEB_API_KEY: '', STEAM_WEB_API_URL: steam.url });
  });

  afterAll(async () => {
    await t?.stop();
    await steam?.stop();
  });

  it('cria a Conta com o avatar neutro e não chama a Steam', async () => {
    const steamId = steamIdFor(1);

    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName: 'jogador' },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(response.statusCode).toBe(200);
    expect((await t.accounts.findBySteamId(steamId))?.avatarUrl).toBeNull();
    expect(steam.requests).toHaveLength(0);
  });
});
