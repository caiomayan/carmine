import type { ModeStats, ProfileStats, TotalStats } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { highlightsOf, statsState } from './profile-stats';

const total: TotalStats = {
  kills: 20,
  deaths: 20,
  assists: 0,
  kd: 1,
  headshotPercent: 20,
  secondsPlayed: 0,
};
const retake: ModeStats = { ...total, mode: 'retake', adr: 0, kpm: null };

describe('statsState', () => {
  it('nulo é a API fora do ar: avisa, não mostra zeros', () => {
    expect(statsState(null)).toBe('unavailable');
  });

  it('Perfil privado visto por outra pessoa', () => {
    expect(statsState({ visible: false, total: null, modes: [] })).toBe('private');
  });

  it('visível mas sem partidas: vazio', () => {
    expect(statsState({ visible: true, total: null, modes: [] })).toBe('empty');
    expect(statsState({ visible: true, total, modes: [] })).toBe('empty');
  });

  it('com total e Modos: pronto', () => {
    const stats: ProfileStats = { visible: true, total, modes: [retake] };
    expect(statsState(stats)).toBe('ready');
  });
});

describe('highlightsOf', () => {
  it('K/D, Kills e HS%, nessa ordem, a partir do total', () => {
    expect(highlightsOf(total).map((h) => [h.key, h.value])).toEqual([
      ['kd', 1],
      ['kills', 20],
      ['headshotPercent', 20],
    ]);
  });

  it('HS% sem kills é nulo, não zero', () => {
    expect(highlightsOf({ ...total, kills: 0, headshotPercent: null })[2]?.value).toBeNull();
  });
});
