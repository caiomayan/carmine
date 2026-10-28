import { describe, expect, it } from 'vitest';
import { dayOf } from '../../src/stats/stats-week.js';
import { nextBrasiliaMidnight, stableInstant } from './stable-clock.js';

const HOUR = 60 * 60 * 1000;

describe('stableInstant', () => {
  it('a meia-noite de Brasília é 03:00 UTC', () => {
    expect(nextBrasiliaMidnight(new Date('2026-10-27T15:00:00Z')).toISOString()).toBe(
      '2026-10-28T03:00:00.000Z',
    );
    // 02:59 UTC ainda é 23:59 do dia 27 em Brasília.
    expect(nextBrasiliaMidnight(new Date('2026-10-28T02:59:00Z')).toISOString()).toBe(
      '2026-10-28T03:00:00.000Z',
    );
    expect(nextBrasiliaMidnight(new Date('2026-10-28T03:00:00Z')).toISOString()).toBe(
      '2026-10-29T03:00:00.000Z',
    );
  });

  it('com folga até a meia-noite, o relógio fica como está', () => {
    const real = new Date('2026-10-27T18:00:00Z'); // 15:00 em Brasília
    expect(stableInstant(real)).toEqual(real);
    const edge = new Date('2026-10-27T23:00:00Z'); // 20:00, exatamente 4 h de folga
    expect(stableInstant(edge)).toEqual(edge);
  });

  it('nas últimas horas do dia, volta para 4 h antes da meia-noite, no mesmo dia de Brasília', () => {
    for (const real of ['2026-10-28T00:30:00Z', '2026-10-28T02:58:00Z', '2026-10-28T02:59:59Z']) {
      const stable = stableInstant(new Date(real));
      expect(stable.toISOString()).toBe('2026-10-27T23:00:00.000Z'); // 20:00 do dia 27
      expect(dayOf(stable)).toBe(dayOf(new Date(real)));
      // e o teste inteiro, até 4 h depois, ainda cabe no mesmo dia
      expect(dayOf(new Date(stable.getTime() + 4 * HOUR - 1))).toBe(dayOf(stable));
    }
  });

  it('nunca devolve um instante depois do real, e respeita outra folga', () => {
    const real = new Date('2026-10-28T01:00:00Z'); // 22:00
    expect(stableInstant(real, 1 * HOUR).getTime()).toBeLessThanOrEqual(real.getTime());
    expect(stableInstant(real, 1 * HOUR)).toEqual(real); // faltam 2 h, mais que a folga de 1 h
    expect(stableInstant(real, 3 * HOUR).toISOString()).toBe('2026-10-28T00:00:00.000Z');
  });

  it('a virada da semana (domingo para segunda) também é uma meia-noite de Brasília', () => {
    // domingo 2026-11-01 23:50 em Brasília = segunda 02:50 UTC
    const sunday = new Date('2026-11-02T02:50:00Z');
    expect(dayOf(sunday)).toBe('2026-11-01');
    expect(dayOf(stableInstant(sunday))).toBe('2026-11-01');
  });
});
