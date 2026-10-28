import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

/** O `cloudflared` da rede do túnel; só dele o CF-Connecting-IP vale. */
const TUNNEL = '10.0.0.2';

const LIMITS = {
  RATE_LIMIT_LOGIN_PER_MINUTE: '3',
  RATE_LIMIT_PUBLIC_PER_MINUTE: '4',
  RATE_LIMIT_EQUIPPED_PER_MINUTE: '5',
  RATE_LIMIT_SERVER_PER_MINUTE: '3',
  TRUSTED_PROXIES: TUNNEL,
};

describe('Rate limit nas rotas da API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp(LIMITS);
  });

  afterAll(async () => {
    await t?.stop();
  });

  const get = (url: string, remoteAddress: string, headers: Record<string, string> = {}) =>
    t.app.inject({ method: 'GET', url, remoteAddress, headers });

  const equipped = (remoteAddress: string, headers: Record<string, string> = {}) =>
    get(`/api/equipped/v5/${steamIdFor(1)}.json`, remoteAddress, headers);

  async function statuses(times: number, request: () => Promise<{ statusCode: number }>) {
    const result: number[] = [];
    for (let i = 0; i < times; i++) result.push((await request()).statusCode);
    return result;
  }

  describe('por IP no equipped/v5 (o limite que era do @fastify/rate-limit)', () => {
    it('informa a política e o que resta nos cabeçalhos RateLimit padronizados', async () => {
      const response = await equipped('198.51.100.1');

      expect(response.statusCode).toBe(200);
      expect(response.headers['ratelimit-policy']).toBe('"equipped";q=5;w=60');
      // 5 por minuto: depois de 1, restam 4, e o balde volta a ficar cheio em 12 s.
      expect(response.headers.ratelimit).toBe('"equipped";r=4;t=12');
    });

    it('acima do limite responde 429 com Retry-After, sem afetar outro IP', async () => {
      const ip = '198.51.100.2';
      expect(await statuses(5, () => equipped(ip))).toEqual([200, 200, 200, 200, 200]);

      const limited = await equipped(ip);

      expect(limited.statusCode).toBe(429);
      expect(limited.headers['retry-after']).toBe('12');
      expect(limited.headers.ratelimit).toBe('"equipped";r=0;t=12');
      expect(limited.json()).toMatchObject({
        statusCode: 429,
        message: 'Muitas requisições; tente de novo em 12 s',
      });
      expect((await equipped('198.51.100.3')).statusCode).toBe(200);
    });

    it('agrupa IPv6 pelo /64: trocar de endereço dentro da mesma rede não renova o limite', async () => {
      for (let i = 1; i <= 5; i++) await equipped(`2001:db8:1:2::${i}`);

      expect((await equipped('2001:db8:1:2:ffff::9')).statusCode).toBe(429);
      expect((await equipped('2001:db8:1:3::1')).statusCode).toBe(200);
    });

    it('rotas sem política não são limitadas: o health do mesmo IP continua respondendo', async () => {
      expect((await get('/api/health', '198.51.100.2')).statusCode).toBe(200);
    });
  });

  describe('IP real atrás do cloudflared', () => {
    it('um CF-Connecting-IP forjado de fora não muda o IP considerado', async () => {
      const attacker = '203.0.113.50';
      const forged = await statuses(6, async () =>
        equipped(attacker, { 'cf-connecting-ip': `198.51.100.${Math.floor(Math.random() * 200)}` }),
      );

      expect(forged).toEqual([200, 200, 200, 200, 200, 429]);
    });

    it('vindo do túnel, cada visitante (CF-Connecting-IP) tem o próprio limite', async () => {
      const visitor = { 'cf-connecting-ip': '198.51.100.60' };
      expect(await statuses(6, () => equipped(TUNNEL, visitor))).toEqual([
        200, 200, 200, 200, 200, 429,
      ]);

      expect((await equipped(TUNNEL, { 'cf-connecting-ip': '198.51.100.61' })).statusCode).toBe(
        200,
      );
    });
  });

  describe('por IP nas rotas públicas do site', () => {
    it('Perfis e /api/me dividem o limite "public" por IP, contado antes da autenticação', async () => {
      const ip = '198.51.100.70';
      const results = [
        await get('/api/profiles/10000', ip),
        await get(`/api/profiles/by-steam-id/${steamIdFor(9)}`, ip),
        await get('/api/me', ip),
        await get('/api/me', ip),
        await get('/api/me', ip),
      ];

      expect(results.map((r) => r.statusCode)).toEqual([404, 404, 401, 401, 429]);
      expect(results[0]?.headers['ratelimit-policy']).toBe('"public";q=4;w=60');
      expect(results[4]?.headers['retry-after']).toBe('15');
    });

    it('o login Steam (início e volta) tem um limite próprio e mais curto', async () => {
      const ip = '198.51.100.80';
      const results = [
        await get('/api/auth/steam/login', ip),
        await get('/api/auth/steam/callback', ip),
        await get('/api/auth/steam/login', ip),
        await get('/api/auth/steam/login?returnTo=%2Finventory', ip),
        await get('/api/auth/steam/callback', ip),
      ];

      // Acima do limite, o login é navegação: volta a /login?erro=limite, não um 429 em JSON.
      expect(results.map((r) => r.statusCode)).toEqual([302, 303, 302, 302, 302]);
      expect(results[3]?.headers.location).toBe(
        'http://localhost:3000/login?erro=limite&voltar=%2Finventory',
      );
      expect(results[3]?.headers['retry-after']).toBe('20');
      expect(results[4]?.headers.location).toBe('http://localhost:3000/login?erro=limite');
      // O limite do login não gasta o das rotas públicas.
      expect((await get('/api/profiles/10000', ip)).statusCode).toBe(404);
    });
  });

  describe('por Servidor Carmine nas rotas de plugin', () => {
    const connect = (key: string, remoteAddress: string, n: number) =>
      t.app.inject({
        method: 'POST',
        url: '/api/server/player-connects',
        headers: { authorization: `Bearer ${key}` },
        payload: { steamId: steamIdFor(100 + n), steamName: `jogador${n}` },
        remoteAddress,
      } satisfies InjectOptions);

    it('conta por servidor, não por IP, e um servidor não gasta o limite de outro', async () => {
      const { key: otherKey } = await t.app
        .get(GameServerRegistry)
        .register({ name: 'dm-teste', mode: 'deathmatch', address: '127.0.0.1:27016' });

      const results = [
        await connect(t.serverKey, '192.0.2.1', 1),
        await connect(t.serverKey, '192.0.2.2', 2),
        await connect(t.serverKey, '192.0.2.3', 3),
        await connect(t.serverKey, '192.0.2.4', 4),
      ];

      expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 429]);
      expect(results[0]?.headers['ratelimit-policy']).toBe('"server";q=3;w=60');
      expect((await connect(otherKey, '192.0.2.1', 5)).statusCode).toBe(200);
    });

    it('sem chave válida responde 401 antes de contar (não há servidor a limitar)', async () => {
      const response = await connect('chave-invalida', '192.0.2.9', 6);

      expect(response.statusCode).toBe(401);
      expect(response.headers.ratelimit).toBeUndefined();
    });
  });
});

describe('Rate limit com o Valkey fora do ar', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp(LIMITS);
    await t.valkey.stop();
  });

  afterAll(async () => {
    await t?.app.close();
    await t?.postgres.stop();
  });

  it('leitura pública e plugins ficam abertos (sem cabeçalhos de limite)', async () => {
    const equippedResponse = await t.app.inject({
      method: 'GET',
      url: `/api/equipped/v5/${steamIdFor(1)}.json`,
    });
    const profile = await t.app.inject({ method: 'GET', url: '/api/profiles/10000' });
    const connect = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId: steamIdFor(1), steamName: 'jogador' },
    });

    expect(equippedResponse.statusCode).toBe(200);
    expect(equippedResponse.headers.ratelimit).toBeUndefined();
    expect(profile.statusCode).toBe(404);
    expect(connect.statusCode).toBe(200);
  });

  it('o login fica fechado: 503 em vez de deixar passar sem contar', async () => {
    const response = await t.app.inject({ method: 'GET', url: '/api/auth/steam/login' });

    expect(response.statusCode).toBe(503);
  });
});
