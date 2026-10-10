import { healthReportSchema } from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './support/app.js';

describe('Health check', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  const publicHealth = () => t.app.inject({ method: 'GET', url: '/api/health' });
  const serverHealth = (key: string | null = t.serverKey) =>
    t.app.inject({
      method: 'GET',
      url: '/api/server/health',
      headers: key === null ? {} : { authorization: `Bearer ${key}` },
    });

  it('a rota pública responde 200 só com o status geral quando tudo está no ar', async () => {
    const response = await publicHealth();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('a rota de servidor mostra o detalhe de cada dependência', async () => {
    const response = await serverHealth();

    expect(response.statusCode).toBe(200);
    const report = healthReportSchema.parse(response.json());
    expect(report.checks.database.status).toBe('up');
    expect(report.checks.valkey.status).toBe('up');
  });

  it('a rota de servidor exige a chave de um Servidor Carmine', async () => {
    expect((await serverHealth(null)).statusCode).toBe(401);
    expect((await serverHealth('cmk_invalida')).statusCode).toBe(401);
  });

  it('com o Valkey fora, a pública responde 503 sem detalhes e a de servidor aponta o Valkey', async () => {
    await t.valkey.stop();

    const pub = await publicHealth();
    const server = await serverHealth();

    expect(pub.statusCode).toBe(503);
    expect(pub.json()).toEqual({ status: 'unavailable' });
    expect(server.statusCode).toBe(503);
    const report = healthReportSchema.parse(server.json());
    expect(report.checks.database.status).toBe('up');
    expect(report.checks.valkey.status).toBe('down');
  });
});
