import type { RankingViewer } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { rankMessage, statsMessage } from './game-stats.js';

const entry = (position: number, score: number): RankingViewer => ({
  entry: {
    position,
    player: { private: false, publicId: 1, displayName: 'a', avatarUrl: null },
    score,
    kd: 1,
    headshotPercent: 50,
    roundsPlayed: 100,
    secondsPlayed: 0,
    self: true,
  },
  progress: null,
  removed: false,
});

describe('!rank', () => {
  it('no Ranking do Retake: posição e rounds vencidos', () => {
    expect(rankMessage('retake', entry(8, 412))).toBe(
      'Retake: 8º da semana · 412 rounds vencidos.',
    );
  });

  it('no Ranking do Deathmatch: posição e KPM com vírgula', () => {
    expect(rankMessage('deathmatch', entry(3, 1.84))).toBe('Deathmatch: 3º da semana · 1,84 KPM.');
  });

  it('dentro do mínimo mas fora do top 50: só a posição', () => {
    expect(rankMessage('retake', entry(73, 90))).toBe('Retake: 73º da semana.');
  });

  it('fora do mínimo: quanto falta, no singular e no plural', () => {
    const progress = (unit: 'rounds' | 'minutes', missing: number): RankingViewer => ({
      entry: null,
      progress: { unit, missing },
      removed: false,
    });
    expect(rankMessage('retake', progress('rounds', 12))).toBe(
      'Faltam 12 rounds para você entrar no Ranking desta semana.',
    );
    expect(rankMessage('retake', progress('rounds', 1))).toBe(
      'Falta 1 round para você entrar no Ranking desta semana.',
    );
    expect(rankMessage('deathmatch', progress('minutes', 7))).toBe(
      'Faltam 7 minutos para você entrar no Ranking desta semana.',
    );
  });

  it('removido pela Staff: não promete posição', () => {
    expect(rankMessage('retake', { entry: null, progress: null, removed: true })).toBe(
      'Você não aparece no Ranking desta semana.',
    );
  });
});

describe('!stats', () => {
  const totals = {
    kills: 120,
    deaths: 80,
    assists: 10,
    headshots: 58,
    damage: 11_742,
    roundsPlayed: 143,
    roundsWon: 80,
    secondsPlayed: 2_280,
  };

  it('Retake: K/D, HS%, ADR e rounds', () => {
    expect(statsMessage('retake', totals)).toBe(
      'Retake na semana: K/D 1,50 · HS 48,3% · ADR 82,1 · 143 rounds.',
    );
  });

  it('Deathmatch: KPM, K/D, HS% e minutos', () => {
    expect(statsMessage('deathmatch', totals)).toBe(
      'Deathmatch na semana: KPM 3,16 · K/D 1,50 · HS 48,3% · 38 min.',
    );
  });

  it('sem jogo na semana: diz que ainda não jogou, sem número inventado', () => {
    expect(statsMessage('retake', null)).toBe('Você ainda não jogou Retake esta semana.');
    expect(statsMessage('deathmatch', { ...totals, secondsPlayed: 0 })).toBe(
      'Você ainda não jogou Deathmatch esta semana.',
    );
  });
});
