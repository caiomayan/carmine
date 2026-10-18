import { describe, expect, it } from 'vitest';
import { type StatsTotals, toModeStats, toTotalStats } from './stats-formulas.js';

const totals = (over: Partial<StatsTotals> = {}): StatsTotals => ({
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

describe('K/D e HS%', () => {
  it('K/D é kills ÷ max(mortes, 1), com 2 casas', () => {
    expect(toTotalStats(totals({ kills: 10, deaths: 3 })).kd).toBe(3.33);
    expect(toTotalStats(totals({ kills: 7, deaths: 0 })).kd).toBe(7);
  });

  it('HS% é nulo sem kills e tem 1 casa', () => {
    expect(toTotalStats(totals()).headshotPercent).toBeNull();
    expect(toTotalStats(totals({ kills: 3, headshots: 1 })).headshotPercent).toBe(33.3);
  });
});

describe('ADR (só Retake) e KPM (só Deathmatch)', () => {
  it('ADR é dano ÷ rounds jogados, com 1 casa, no Retake', () => {
    const stats = toModeStats('retake', totals({ damage: 1000, roundsPlayed: 12 }));

    expect(stats.adr).toBe(83.3);
    expect(stats.kpm).toBeNull();
  });

  it('ADR é nulo sem rounds jogados', () => {
    expect(toModeStats('retake', totals({ damage: 50 })).adr).toBeNull();
  });

  it('KPM é kills ÷ minutos jogados, com 2 casas, no Deathmatch', () => {
    const stats = toModeStats('deathmatch', totals({ kills: 50, secondsPlayed: 1800 }));

    expect(stats.kpm).toBe(1.67);
    expect(stats.adr).toBeNull();
  });

  it('KPM é nulo sem tempo jogado', () => {
    expect(toModeStats('deathmatch', totals({ kills: 5 })).kpm).toBeNull();
  });
});

describe('total', () => {
  it('não leva ADR nem KPM, que não se somam entre Modos', () => {
    expect(Object.keys(toTotalStats(totals()))).not.toEqual(expect.arrayContaining(['adr', 'kpm']));
  });
});
