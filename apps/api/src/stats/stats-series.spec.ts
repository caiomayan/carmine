import { PROFILE_SERIES_WEEKS } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { buildSeries, seriesWeeks, type WeeklyRow } from './stats-series.js';

const row = (over: Partial<WeeklyRow> & Pick<WeeklyRow, 'mode' | 'weekStart'>): WeeklyRow => ({
  kills: 0,
  deaths: 0,
  assists: 0,
  headshots: 0,
  damage: 0,
  roundsPlayed: 0,
  roundsWon: 0,
  secondsPlayed: 0,
  ...over,
});

const NOW_WEEK = '2026-10-19';

describe('seriesWeeks', () => {
  it('lista as 8 últimas segundas-feiras, da mais antiga à atual', () => {
    const weeks = seriesWeeks(NOW_WEEK);

    expect(weeks).toHaveLength(PROFILE_SERIES_WEEKS);
    expect(weeks[0]).toBe('2026-08-31');
    expect(weeks.at(-1)).toBe(NOW_WEEK);
  });

  it('atravessa a virada do ano', () => {
    expect(seriesWeeks('2027-01-04', 3)).toEqual(['2026-12-21', '2026-12-28', '2027-01-04']);
  });
});

describe('buildSeries', () => {
  it('sem nenhuma linha, tudo zero, HS% nulo e nada de "primeira semana"', () => {
    const series = buildSeries([], NOW_WEEK);

    expect(series.weeks).toHaveLength(8);
    expect(series.weeks.every((w) => w.rounds === 0 && w.kills === 0 && w.kd === 0)).toBe(true);
    expect(series.weeks.every((w) => w.headshotPercent === null)).toBe(true);
    expect(series.hours).toEqual({
      week: [
        { mode: 'retake', secondsPlayed: 0 },
        { mode: 'deathmatch', secondsPlayed: 0 },
      ],
      total: [
        { mode: 'retake', secondsPlayed: 0 },
        { mode: 'deathmatch', secondsPlayed: 0 },
      ],
    });
    expect(series.firstWeek).toBeNull();
  });

  it('soma os Modos de cada semana e mantém os números de cada Modo', () => {
    const series = buildSeries(
      [
        row({
          mode: 'retake',
          weekStart: NOW_WEEK,
          kills: 10,
          deaths: 4,
          headshots: 5,
          roundsPlayed: 60,
          secondsPlayed: 3600,
        }),
        row({
          mode: 'deathmatch',
          weekStart: NOW_WEEK,
          kills: 30,
          deaths: 16,
          headshots: 3,
          secondsPlayed: 1800,
        }),
      ],
      NOW_WEEK,
    );

    const current = series.weeks.at(-1);
    expect(current).toMatchObject({
      weekStart: NOW_WEEK,
      rounds: 60,
      kills: 40,
      deaths: 20,
      kd: 2,
      headshotPercent: 20,
      secondsPlayed: 5400,
    });
    expect(current?.modes).toEqual([
      expect.objectContaining({
        mode: 'retake',
        rounds: 60,
        kills: 10,
        kd: 2.5,
        headshotPercent: 50,
        secondsPlayed: 3600,
      }),
      expect.objectContaining({
        mode: 'deathmatch',
        rounds: 0,
        kills: 30,
        kd: 1.88,
        headshotPercent: 10,
        secondsPlayed: 1800,
      }),
    ]);
  });

  it('semana sem linha vem com zeros; um Modo parado na semana também', () => {
    const series = buildSeries(
      [row({ mode: 'retake', weekStart: '2026-10-05', kills: 2, deaths: 1, roundsPlayed: 5 })],
      NOW_WEEK,
    );

    const byWeek = Object.fromEntries(series.weeks.map((w) => [w.weekStart, w]));
    expect(byWeek['2026-10-05']).toMatchObject({ rounds: 5, kills: 2, kd: 2 });
    expect(byWeek['2026-10-12']).toMatchObject({ rounds: 0, kills: 0, headshotPercent: null });
    expect(byWeek['2026-10-05']?.modes[1]).toMatchObject({ mode: 'deathmatch', kills: 0 });
  });

  it('as horas da semana são só da atual; as do total, de sempre, inclusive fora das 8 semanas', () => {
    const series = buildSeries(
      [
        row({ mode: 'retake', weekStart: NOW_WEEK, secondsPlayed: 600 }),
        row({ mode: 'retake', weekStart: '2026-10-12', secondsPlayed: 1200 }),
        row({ mode: 'deathmatch', weekStart: '2025-01-06', secondsPlayed: 7200 }),
      ],
      NOW_WEEK,
    );

    expect(series.hours?.week).toEqual([
      { mode: 'retake', secondsPlayed: 600 },
      { mode: 'deathmatch', secondsPlayed: 0 },
    ]);
    expect(series.hours?.total).toEqual([
      { mode: 'retake', secondsPlayed: 1800 },
      { mode: 'deathmatch', secondsPlayed: 7200 },
    ]);
  });

  it('a primeira semana é a mais antiga com atividade, mesmo fora das 8 semanas', () => {
    const series = buildSeries(
      [
        row({ mode: 'retake', weekStart: '2026-10-12', kills: 1 }),
        row({ mode: 'deathmatch', weekStart: '2025-01-06', kills: 1 }),
      ],
      NOW_WEEK,
    );

    expect(series.firstWeek).toBe('2025-01-06');
    expect(series.weeks.some((w) => w.weekStart === '2025-01-06')).toBe(false);
  });
});
