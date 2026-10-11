import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

/** Loadout vazio no formato do cs2-css-inventory-simulator: todo slot fica com a Arma padrão. */
const EMPTY_LOADOUT = '{"agents":{},"ctWeapons":{},"gloves":{},"knives":{},"tWeapons":{}}';

describe('GET /api/equipped/v5/{steamId}.json', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp({ RATE_LIMIT_EQUIPPED_PER_MINUTE: '5' });
  });

  afterAll(async () => {
    await t?.stop();
  });

  const equipped = (steamId: string, remoteAddress = '198.51.100.1') =>
    t.app.inject({ method: 'GET', url: `/api/equipped/v5/${steamId}.json`, remoteAddress });

  it('é público e devolve o Loadout vazio de uma Conta que já jogou', async () => {
    const steamId = steamIdFor(1);
    await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName: 'jogador' },
    });

    const response = await equipped(steamId, '198.51.100.10');

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body).toBe(EMPTY_LOADOUT);
  });

  it('devolve o Loadout vazio também para quem ainda não tem Conta', async () => {
    const response = await equipped(steamIdFor(999), '198.51.100.11');

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(EMPTY_LOADOUT);
  });

  it('responde 400 a um SteamID inválido', async () => {
    const response = await equipped('123', '198.51.100.12');

    expect(response.statusCode).toBe(400);
  });

  it('limita as requisições por IP e responde 429 acima do limite, sem afetar outros IPs', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await equipped(steamIdFor(i), '198.51.100.20')).statusCode);
    }
    const otherIp = await equipped(steamIdFor(1), '198.51.100.21');

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(otherIp.statusCode).toBe(200);
  });

  it('o limite vale só para o equipped: o health do mesmo IP continua respondendo', async () => {
    const response = await t.app.inject({
      method: 'GET',
      url: '/api/health',
      remoteAddress: '198.51.100.20',
    });

    expect(response.statusCode).toBe(200);
  });
});
