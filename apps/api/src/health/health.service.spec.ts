import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service.js';

const up = async () => {};
const never = () => new Promise<void>(() => {});

describe('HealthService', () => {
  it('fica ok quando todas as dependências respondem', async () => {
    const health = new HealthService({ database: up, valkey: up }, 1000);

    const report = await health.check();

    expect(report.status).toBe('ok');
    expect(report.checks.database).toMatchObject({ status: 'up' });
    expect(report.checks.valkey).toMatchObject({ status: 'up' });
    expect(Number.isInteger(report.checks.database.latencyMs)).toBe(true);
  });

  it('fica indisponível e mostra o erro da dependência que falhou', async () => {
    const failing = async () => {
      throw new Error('connection refused');
    };
    const health = new HealthService({ database: failing, valkey: up }, 1000);

    const report = await health.check();

    expect(report.status).toBe('unavailable');
    expect(report.checks.database).toMatchObject({ status: 'down', error: 'connection refused' });
    expect(report.checks.valkey).toMatchObject({ status: 'up' });
  });

  it('considera fora do ar a dependência que não responde dentro do limite', async () => {
    const health = new HealthService({ database: up, valkey: never }, 50);

    const report = await health.check();

    expect(report.status).toBe('unavailable');
    expect(report.checks.valkey).toMatchObject({
      status: 'down',
      error: 'sem resposta em 50 ms',
    });
  });
});
