import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const validEnv = {
  DATABASE_URL: 'postgres://carmine:carmine@localhost:5432/carmine',
  VALKEY_URL: 'redis://localhost:6379',
};

describe('loadConfig', () => {
  it('aplica os padrões quando só as URLs obrigatórias são informadas', () => {
    expect(loadConfig(validEnv)).toEqual({
      nodeEnv: 'development',
      host: '0.0.0.0',
      port: 3333,
      logLevel: 'info',
      databaseUrl: 'postgres://carmine:carmine@localhost:5432/carmine',
      valkeyUrl: 'redis://localhost:6379',
      healthCheckTimeoutMs: 2000,
      steamWebApi: { key: null, url: 'https://api.steampowered.com', timeoutMs: 5000 },
      trustedProxies: [],
      rateLimitsPerMinute: { login: 20, public: 240, equipped: 120, mutations: 60, server: 600 },
      publicWebUrl: 'http://localhost:3000',
      steamOpenIdUrl: 'https://steamcommunity.com/openid/login',
      session: { idleTtlSeconds: 1_209_600, absoluteTtlSeconds: 7_776_000 },
    });
  });

  it('lê os proxies confiáveis e recusa um que não é IP nem rede', () => {
    expect(loadConfig({ ...validEnv, TRUSTED_PROXIES: '172.30.0.10, 10.8.0.0/16' })).toMatchObject({
      trustedProxies: ['172.30.0.10', '10.8.0.0/16'],
    });
    expect(() => loadConfig({ ...validEnv, TRUSTED_PROXIES: 'cloudflared' })).toThrow(
      /TRUSTED_PROXIES: proxy confiável inválido: "cloudflared"/,
    );
  });

  it('lê os limites de cada política de rate limit', () => {
    const config = loadConfig({
      ...validEnv,
      RATE_LIMIT_LOGIN_PER_MINUTE: '5',
      RATE_LIMIT_SERVER_PER_MINUTE: '1000',
    });

    expect(config.rateLimitsPerMinute).toMatchObject({ login: 5, server: 1000 });
    expect(() => loadConfig({ ...validEnv, RATE_LIMIT_PUBLIC_PER_MINUTE: '0' })).toThrow(
      /RATE_LIMIT_PUBLIC_PER_MINUTE/,
    );
  });

  it('lê a origem pública do web sem a barra final', () => {
    const config = loadConfig({ ...validEnv, PUBLIC_WEB_URL: 'https://stcarmine.com/' });

    expect(config.publicWebUrl).toBe('https://stcarmine.com');
  });

  it('rejeita uma origem pública do web com caminho', () => {
    expect(() => loadConfig({ ...validEnv, PUBLIC_WEB_URL: 'https://stcarmine.com/app' })).toThrow(
      /PUBLIC_WEB_URL/,
    );
  });

  it('exige HTTPS na origem pública e na Steam OpenID em produção', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        NODE_ENV: 'production',
        PUBLIC_WEB_URL: 'http://stcarmine.com',
        STEAM_OPENID_URL: 'http://127.0.0.1:9999/openid/login',
      }),
    ).toThrow(/PUBLIC_WEB_URL[\s\S]*STEAM_OPENID_URL/);
  });

  it('rejeita uma sessão absoluta mais curta que a ociosa', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SESSION_IDLE_TTL_SECONDS: '100',
        SESSION_ABSOLUTE_TTL_SECONDS: '50',
      }),
    ).toThrow(/SESSION_ABSOLUTE_TTL_SECONDS/);
  });

  it('lê a chave da Steam Web API e ignora a barra final da URL', () => {
    const config = loadConfig({
      ...validEnv,
      STEAM_WEB_API_KEY: ' abc123 ',
      STEAM_WEB_API_URL: 'http://localhost:9999/',
    });

    expect(config.steamWebApi).toEqual({
      key: 'abc123',
      url: 'http://localhost:9999',
      timeoutMs: 5000,
    });
  });

  it('converte números vindos como texto', () => {
    const config = loadConfig({ ...validEnv, PORT: '8080', HEALTH_CHECK_TIMEOUT_MS: '500' });

    expect(config.port).toBe(8080);
    expect(config.healthCheckTimeoutMs).toBe(500);
  });

  it('falha listando cada variável ausente ou inválida', () => {
    expect(() => loadConfig({ PORT: 'abc', VALKEY_URL: 'http://localhost:6379' })).toThrow(
      /DATABASE_URL[\s\S]*PORT[\s\S]*VALKEY_URL/,
    );
  });

  it('rejeita uma DATABASE_URL que não é do Postgres', () => {
    expect(() => loadConfig({ ...validEnv, DATABASE_URL: 'mysql://localhost/carmine' })).toThrow(
      /DATABASE_URL/,
    );
  });
});
