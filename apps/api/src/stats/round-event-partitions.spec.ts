import { describe, expect, it } from 'vitest';
import {
  addMonths,
  monthOf,
  monthStart,
  parsePartitionName,
  partitionName,
  retentionCutoff,
} from './round-event-partitions.js';

describe('partições mensais de round_events', () => {
  it('o mês é o UTC do instante, e o nome tem o mês com dois dígitos', () => {
    expect(monthOf(new Date('2026-10-31T23:59:59Z'))).toEqual({ year: 2026, month: 10 });
    expect(monthOf(new Date('2026-11-01T00:00:00Z'))).toEqual({ year: 2026, month: 11 });
    expect(partitionName({ year: 2026, month: 3 })).toBe('round_events_y2026m03');
    expect(partitionName({ year: 2027, month: 12 })).toBe('round_events_y2027m12');
  });

  it('só reconhece o nome das partições que nós criamos', () => {
    expect(parsePartitionName('round_events_y2026m03')).toEqual({ year: 2026, month: 3 });
    expect(parsePartitionName('round_events_y2026m13')).toBeNull();
    expect(parsePartitionName('round_events_default')).toBeNull();
    expect(parsePartitionName('round_events')).toBeNull();
    expect(parsePartitionName('outra_y2026m03')).toBeNull();
  });

  it('soma meses atravessando o ano, para os dois lados', () => {
    expect(addMonths({ year: 2026, month: 11 }, 2)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 10 }, -12)).toEqual({ year: 2025, month: 10 });
    expect(monthStart({ year: 2026, month: 10 }).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('o corte da retenção é a mesma data de 12 meses atrás', () => {
    expect(retentionCutoff(new Date('2026-10-29T12:30:00Z')).toISOString()).toBe(
      '2025-10-29T12:30:00.000Z',
    );
  });

  it('o corte não estoura o fim do mês: 29 de fevereiro cai em 28', () => {
    expect(retentionCutoff(new Date('2028-02-29T00:00:00Z')).toISOString()).toBe(
      '2027-02-28T00:00:00.000Z',
    );
    expect(retentionCutoff(new Date('2026-03-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });
});
