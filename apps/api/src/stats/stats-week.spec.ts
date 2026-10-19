import { describe, expect, it } from 'vitest';
import { splitByWeek, weekStartOf } from './stats-week.js';

describe('weekStartOf', () => {
  it('a semana começa na segunda-feira às 00:00 de Brasília', () => {
    // 2026-10-19 é segunda; 00:00 BRT = 03:00 UTC.
    expect(weekStartOf(new Date('2026-10-19T03:00:00Z'))).toBe('2026-10-19');
    expect(weekStartOf(new Date('2026-10-19T02:59:59Z'))).toBe('2026-10-12');
  });

  it('o domingo à noite ainda é da semana que acaba', () => {
    expect(weekStartOf(new Date('2026-10-19T01:30:00-03:00'))).toBe('2026-10-19');
    expect(weekStartOf(new Date('2026-10-18T23:59:59-03:00'))).toBe('2026-10-12');
  });

  it('atravessa a virada de mês e de ano', () => {
    expect(weekStartOf(new Date('2027-01-01T12:00:00-03:00'))).toBe('2026-12-28');
  });
});

describe('splitByWeek', () => {
  it('uma sessão dentro de uma semana vira um pedaço só', () => {
    expect(
      splitByWeek(new Date('2026-10-14T20:00:00-03:00'), new Date('2026-10-14T21:30:00-03:00')),
    ).toEqual([{ weekStart: '2026-10-12', seconds: 5400 }]);
  });

  it('uma sessão que cruza a segunda-feira se divide entre as duas semanas', () => {
    expect(
      splitByWeek(new Date('2026-10-18T23:30:00-03:00'), new Date('2026-10-19T00:45:00-03:00')),
    ).toEqual([
      { weekStart: '2026-10-12', seconds: 1800 },
      { weekStart: '2026-10-19', seconds: 2700 },
    ]);
  });

  it('fim antes ou igual ao início não rende pedaço', () => {
    const at = new Date('2026-10-14T20:00:00-03:00');
    expect(splitByWeek(at, at)).toEqual([]);
    expect(splitByWeek(at, new Date(at.getTime() - 1000))).toEqual([]);
  });
});
