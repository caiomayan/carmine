import type { WeekSummary } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { weekProgress, weekRange, weekRows, weekTurnAt } from './week-stats';

const summary = (over: Partial<WeekSummary> = {}): WeekSummary => ({
  weekStart: '2026-10-19',
  weekEnd: '2026-10-25',
  current: { players: 30, kills: 1200, headshots: 480, secondsPlayed: 36 * 3600 },
  previous: { players: 24, kills: 1000, headshots: 350, secondsPlayed: 40 * 3600 },
  ...over,
});

const row = (rows: ReturnType<typeof weekRows>, key: string) => rows.find((r) => r.key === key);

describe('weekRows', () => {
  it('traz jogadores, abates, HS% e horas, nessa ordem', () => {
    expect(weekRows(summary()).map((r) => r.key)).toEqual([
      'players',
      'kills',
      'headshotPercent',
      'hours',
    ]);
  });

  it('calcula HS% e horas dos totais', () => {
    const rows = weekRows(summary());
    expect(row(rows, 'headshotPercent')).toMatchObject({ value: 40, decimals: 1, suffix: '%' });
    expect(row(rows, 'hours')).toMatchObject({ value: 36, decimals: 0, suffix: ' h' });
  });

  it('horas abaixo de 10 mostram uma casa', () => {
    const rows = weekRows(
      summary({ current: { players: 3, kills: 10, headshots: 2, secondsPlayed: 5400 } }),
    );
    expect(row(rows, 'hours')).toMatchObject({ value: 1.5, decimals: 1 });
  });

  it('a variação sobre a semana anterior: % nos totais e pontos no HS%', () => {
    const rows = weekRows(summary());
    expect(row(rows, 'players')?.delta).toEqual({ kind: 'percent', direction: 'up', amount: 25 });
    expect(row(rows, 'hours')?.delta).toEqual({ kind: 'percent', direction: 'down', amount: 10 });
    expect(row(rows, 'headshotPercent')?.delta).toEqual({
      kind: 'points',
      direction: 'up',
      amount: 5,
    });
  });

  it('sem semana anterior (ou sem jogo nela) não há variação, em vez de inventar uma', () => {
    for (const previous of [null, { players: 0, kills: 0, headshots: 0, secondsPlayed: 0 }]) {
      const rows = weekRows(summary({ previous }));
      expect(rows.every((r) => r.delta === null)).toBe(true);
    }
  });

  it('sem abates o HS% é zero e sem variação', () => {
    const rows = weekRows(
      summary({ current: { players: 1, kills: 0, headshots: 0, secondsPlayed: 60 } }),
    );
    expect(row(rows, 'headshotPercent')).toMatchObject({ value: 0, delta: null });
  });

  it('variação que arredonda para zero é "igual"', () => {
    const rows = weekRows(
      summary({
        current: { players: 1000, kills: 1000, headshots: 400, secondsPlayed: 3600 },
        previous: { players: 1001, kills: 1000, headshots: 400, secondsPlayed: 3600 },
      }),
    );
    expect(row(rows, 'players')?.delta).toEqual({ kind: 'percent', direction: 'same', amount: 0 });
  });
});

describe('a semana no calendário', () => {
  const MONDAY = '2026-10-19';
  const start = Date.parse('2026-10-19T03:00:00Z'); // segunda 00:00 em Brasília

  it('o progresso vai de 0 a 1 e não passa dos extremos', () => {
    expect(weekProgress(MONDAY, start - 1000)).toBe(0);
    expect(weekProgress(MONDAY, start)).toBe(0);
    expect(weekProgress(MONDAY, start + 3.5 * 24 * 3600_000)).toBeCloseTo(0.5, 5);
    expect(weekProgress(MONDAY, start + 9 * 24 * 3600_000)).toBe(1);
  });

  it('a virada é a segunda-feira seguinte às 00:00 de Brasília', () => {
    expect(new Date(weekTurnAt(MONDAY)).toISOString()).toBe('2026-10-26T03:00:00.000Z');
  });

  it('o intervalo é escrito em pt-BR', () => {
    expect(weekRange('2026-10-19', '2026-10-25')).toBe('19 de out. a 25 de out.');
  });
});
