import { describe, expect, it } from 'vitest';
import { healthReportSchema } from './health.js';

describe('healthReportSchema', () => {
  it('aceita um relatório com todas as dependências no ar', () => {
    const report = {
      status: 'ok',
      checks: {
        database: { status: 'up', latencyMs: 3 },
        valkey: { status: 'up', latencyMs: 1 },
      },
    };

    expect(healthReportSchema.parse(report)).toEqual(report);
  });

  it('aceita uma dependência fora do ar com a mensagem de erro', () => {
    const report = {
      status: 'unavailable',
      checks: {
        database: { status: 'down', latencyMs: 2000, error: 'connection refused' },
        valkey: { status: 'up', latencyMs: 1 },
      },
    };

    expect(healthReportSchema.parse(report)).toEqual(report);
  });

  it('rejeita um status desconhecido', () => {
    const report = {
      status: 'maybe',
      checks: {
        database: { status: 'up', latencyMs: 1 },
        valkey: { status: 'up', latencyMs: 1 },
      },
    };

    expect(healthReportSchema.safeParse(report).success).toBe(false);
  });
});
