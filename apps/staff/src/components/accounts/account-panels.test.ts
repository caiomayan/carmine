import { describe, expect, it } from 'vitest';
import { recentWeekStarts } from './account-panels';

describe('semanas oferecidas para tirar do Ranking', () => {
  it('são segundas-feiras, da atual para trás, no horário de Brasília', () => {
    // Quarta-feira, 29/10/2026, 12h em Brasília.
    expect(recentWeekStarts(new Date('2026-10-28T15:00:00Z'), 3)).toEqual([
      '2026-10-26',
      '2026-10-19',
      '2026-10-12',
    ]);
  });

  it('a virada da semana é segunda 00h em Brasília (03h UTC)', () => {
    expect(recentWeekStarts(new Date('2026-10-26T02:59:00Z'), 1)).toEqual(['2026-10-19']);
    expect(recentWeekStarts(new Date('2026-10-26T03:00:00Z'), 1)).toEqual(['2026-10-26']);
  });
});
