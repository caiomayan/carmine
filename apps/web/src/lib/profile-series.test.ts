import type { GameMode, ModeStats, ProfileSeries, TotalStats, WeekStats } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import {
  currentWeekOf,
  defaultPeriod,
  hasActivity,
  hoursByMode,
  modeCardsOf,
  numbersOf,
  roundsByWeek,
} from './profile-series';

const counts = {
  rounds: 0,
  kills: 0,
  deaths: 0,
  kd: 0,
  headshotPercent: null,
  secondsPlayed: 0,
};

const week = (weekStart: string, over: Partial<WeekStats> = {}): WeekStats => ({
  weekStart,
  ...counts,
  ...over,
  modes: (['retake', 'deathmatch'] as GameMode[]).map((mode) => ({ mode, ...counts })),
});

const series = (weeks: WeekStats[], hours: ProfileSeries['hours'] = null): ProfileSeries => ({
  visible: true,
  weeks,
  hours,
  firstWeek: null,
});

const total: TotalStats = {
  kills: 9846,
  deaths: 6000,
  assists: 120,
  kd: 1.64,
  headshotPercent: 43.8,
  secondsPlayed: 238 * 3600,
};

const mode = (over: Partial<ModeStats> & Pick<ModeStats, 'mode'>): ModeStats => ({
  kills: 10,
  deaths: 5,
  assists: 1,
  kd: 2,
  headshotPercent: 30,
  secondsPlayed: 3600,
  adr: null,
  kpm: null,
  ...over,
});

describe('defaultPeriod', () => {
  it('abre na semana quando ela teve atividade', () => {
    expect(defaultPeriod(series([week('2026-10-12'), week('2026-10-19', { kills: 3 })]))).toBe(
      'week',
    );
  });

  it('abre no total quando a semana está zerada ou não há série', () => {
    expect(defaultPeriod(series([week('2026-10-19')]))).toBe('total');
    expect(defaultPeriod(null)).toBe('total');
  });
});

describe('numbersOf', () => {
  const weeks = [
    week('2026-10-05', { kills: 100, kd: 1, headshotPercent: 40, secondsPlayed: 3600, rounds: 10 }),
    week('2026-10-12'),
    week('2026-10-19', {
      kills: 150,
      kd: 2,
      headshotPercent: 50,
      secondsPlayed: 5400,
      rounds: 12,
    }),
  ];

  it('na semana usa a semana atual; no total, as somas', () => {
    const [kd, kills, hs, hours] = numbersOf('week', total, series(weeks));
    expect([kd?.value, kills?.value, hs?.value, hours?.value]).toEqual([2, 150, 50, 1.5]);

    const all = numbersOf('total', total, series(weeks));
    expect(all.map((n) => n.value)).toEqual([1.64, 9846, 43.8, 238]);
  });

  it('a tendência só leva as semanas com atividade, nunca zeros inventados', () => {
    const [kd, kills, hs, hours] = numbersOf('week', total, series(weeks));
    expect(kd?.trend).toEqual([1, 2]);
    expect(kills?.trend).toEqual([100, 150]);
    expect(hs?.trend).toEqual([40, 50]);
    expect(hours?.trend).toEqual([1, 1.5]);
  });

  it('com menos de duas semanas com dado não há tendência', () => {
    const only = numbersOf('week', total, series([week('2026-10-19', { kills: 5, kd: 1 })]));
    expect(only.every((n) => n.trend === null)).toBe(true);
    expect(numbersOf('total', total, null).every((n) => n.trend === null)).toBe(true);
  });

  it('a semana sem abates tem HS% nulo, não 0%', () => {
    const [, , hs] = numbersOf('week', total, series([week('2026-10-19', { secondsPlayed: 60 })]));
    expect(hs?.value).toBeNull();
  });

  it('horas grandes perdem a casa decimal', () => {
    const [, , , hours] = numbersOf('total', total, null);
    expect(hours).toMatchObject({ decimals: 0, suffix: ' h' });
    const [, , , small] = numbersOf('total', { ...total, secondsPlayed: 5400 }, null);
    expect(small).toMatchObject({ value: 1.5, decimals: 1 });
  });
});

describe('modeCardsOf', () => {
  it('na semana, só os Modos com atividade; rounds só no Retake', () => {
    const current = week('2026-10-19', { kills: 5 });
    current.modes = [
      { mode: 'retake', ...counts, rounds: 20, kills: 5, kd: 2.5, secondsPlayed: 600 },
      { mode: 'deathmatch', ...counts },
    ];

    const cards = modeCardsOf('week', [], series([current]));

    expect(cards.map((c) => c.mode)).toEqual(['retake']);
    expect(cards[0]?.rows.map((r) => r.key)).toEqual([
      'rounds',
      'kills',
      'kd',
      'headshotPercent',
      'timePlayed',
    ]);
  });

  it('no total, todas as linhas das Estatísticas, com ADR no Retake e KPM no Deathmatch', () => {
    const cards = modeCardsOf(
      'total',
      [mode({ mode: 'retake', adr: 80.5 }), mode({ mode: 'deathmatch', kpm: 1.9 })],
      null,
    );

    expect(cards[0]?.rows.map((r) => r.key)).toEqual([
      'kills',
      'deaths',
      'assists',
      'kd',
      'headshotPercent',
      'adr',
      'timePlayed',
    ]);
    expect(cards[1]?.rows.map((r) => r.key)).toContain('kpm');
    expect(cards[1]?.rows.map((r) => r.key)).not.toContain('adr');
  });
});

describe('hoursByMode', () => {
  it('usa as horas da série e deixa de fora o Modo parado', () => {
    const data = series([week('2026-10-19')], {
      week: [
        { mode: 'retake', secondsPlayed: 3600 },
        { mode: 'deathmatch', secondsPlayed: 0 },
      ],
      total: [
        { mode: 'retake', secondsPlayed: 7200 },
        { mode: 'deathmatch', secondsPlayed: 1800 },
      ],
    });

    expect(hoursByMode('week', data, [])).toEqual([{ mode: 'retake', seconds: 3600 }]);
    expect(hoursByMode('total', data, [])).toEqual([
      { mode: 'retake', seconds: 7200 },
      { mode: 'deathmatch', seconds: 1800 },
    ]);
  });

  it('sem a série, o total sai das Estatísticas', () => {
    expect(hoursByMode('total', null, [mode({ mode: 'retake', secondsPlayed: 600 })])).toEqual([
      { mode: 'retake', seconds: 600 },
    ]);
  });
});

describe('séries simples', () => {
  it('a semana atual é a última; sem série não há semana', () => {
    expect(currentWeekOf(series([week('2026-10-12'), week('2026-10-19')]))?.weekStart).toBe(
      '2026-10-19',
    );
    expect(currentWeekOf(null)).toBeNull();
  });

  it('rounds por semana segue a série; atividade é rounds, abates ou tempo', () => {
    expect(roundsByWeek(series([week('2026-10-12', { rounds: 4 })]))).toEqual([
      { weekStart: '2026-10-12', rounds: 4 },
    ]);
    expect(roundsByWeek(null)).toEqual([]);
    expect(hasActivity(week('2026-10-12'))).toBe(false);
    expect(hasActivity(week('2026-10-12', { secondsPlayed: 1 }))).toBe(true);
  });
});
