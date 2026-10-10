import { healthReportSchema } from '@carmine/contracts';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { type StartedValkeyContainer, ValkeyContainer } from '@testcontainers/valkey';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/config.js';
import { POSTGRES_IMAGE, VALKEY_IMAGE } from './images.js';

describe('GET /api/health', () => {
  let postgres: StartedPostgreSqlContainer;
  let valkey: StartedValkeyContainer;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    [postgres, valkey] = await Promise.all([
      new PostgreSqlContainer(POSTGRES_IMAGE).start(),
      new ValkeyContainer(VALKEY_IMAGE).start(),
    ]);
    const config = loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      DATABASE_URL: postgres.getConnectionUri(),
      VALKEY_URL: valkey.getConnectionUrl(),
      HEALTH_CHECK_TIMEOUT_MS: '1000',
    });
    app = await createApp(config);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([postgres?.stop(), valkey?.stop()]);
  });

  it('responde 200 quando Postgres e Valkey estão no ar', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    const report = healthReportSchema.parse(response.json());
    expect(report.status).toBe('ok');
    expect(report.checks.database.status).toBe('up');
    expect(report.checks.valkey.status).toBe('up');
  });

  it('responde 503 apontando o Valkey quando ele cai', async () => {
    await valkey.stop();

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    const report = healthReportSchema.parse(response.json());
    expect(report.status).toBe('unavailable');
    expect(report.checks.database.status).toBe('up');
    expect(report.checks.valkey.status).toBe('down');
  });
});
