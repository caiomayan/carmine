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
