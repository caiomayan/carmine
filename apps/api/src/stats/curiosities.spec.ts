import type { RankingViewer } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import {
  curiosities,
  firstConnectGreeting,
  type GreetingFacts,
  pickGreeting,
} from './curiosities.js';

const totals = {
  kills: 100,
  deaths: 80,
  assists: 5,
  headshots: 41,
  damage: 9000,
  roundsPlayed: 90,
  roundsWon: 50,
  secondsPlayed: 3000,
};

const inRanking: RankingViewer = {
  entry: {
    position: 8,
    player: { private: false, publicId: 1, displayName: 'a', avatarUrl: null },
    score: 412,
    kd: 1,
    headshotPercent: 40,
    roundsPlayed: 90,
    secondsPlayed: 3000,
    self: true,
  },
  progress: null,
  removed: false,
};

const facts = (over: Partial<GreetingFacts> = {}): GreetingFacts => ({
  mode: 'retake',
  displayName: 'Gabriel',
  hasStatsInMode: true,
  week: totals,
  viewer: inRanking,
  days: [
    { day: '2026-10-26', roundsWon: 10, kills: 20 },
    { day: '2026-10-27', roundsWon: 132, kills: 90 },
  ],
  totalSeconds: 37 * 3600 + 120,
  ...over,
});

describe('curiosidades', () => {
  it('lista as que se aplicam, com os textos da spec', () => {
    const lines = curiosities(facts()).map((c) => c.line);

    expect(lines).toContain('Você está em 8º no Ranking de Retake.');
    expect(lines).toContain('Você fez 41 headshots esta semana.');
    expect(lines).toContain('Seu melhor dia da semana foi terça, com 132 rounds vencidos.');
    expect(lines).toContain('Você já jogou 37 horas no Carmine.');
    expect(lines.some((l) => l.includes('entrar no Ranking'))).toBe(false);
  });

  it('fora do mínimo: quanto falta, no singular e no plural', () => {
    const outside = (missing: number): RankingViewer => ({
      entry: null,
      progress: { unit: 'rounds', missing },
      removed: false,
    });

    expect(curiosities(facts({ viewer: outside(12) })).map((c) => c.line)).toContain(
      'Faltam 12 rounds para você entrar no Ranking desta semana.',
    );
    expect(curiosities(facts({ viewer: outside(1) })).map((c) => c.line)).toContain(
      'Falta 1 round para você entrar no Ranking desta semana.',
    );
  });

  it('o melhor dia só vale com 2 dias ou mais de atividade', () => {
    const one = facts({ days: [{ day: '2026-10-27', roundsWon: 132, kills: 90 }] });

    expect(curiosities(one).some((c) => c.key === 'best-day')).toBe(false);
  });

  it('no Deathmatch o melhor dia conta abates e o ranking fala de Deathmatch', () => {
    const lines = curiosities(facts({ mode: 'deathmatch' })).map((c) => c.line);

    expect(lines).toContain('Seu melhor dia da semana foi terça, com 90 abates.');
    expect(lines).toContain('Você está em 8º no Ranking de Deathmatch.');
  });

  it('menos de uma hora de jogo não vira curiosidade de horas', () => {
    expect(curiosities(facts({ totalSeconds: 3599 })).some((c) => c.key === 'hours')).toBe(false);
  });
});

describe('linha do connect', () => {
  it('primeiro connect da Conta: boas-vindas com o aviso dos termos (ADR 0007)', () => {
    expect(firstConnectGreeting('Gabriel')).toBe(
      'Bem-vindo, Gabriel. Ao jogar você concorda com os termos: stcarmine.com/terms',
    );
  });

  it('Conta nova no Modo: boas-vindas com o nome', () => {
    expect(pickGreeting(facts({ hasStatsInMode: false }), null)).toEqual({
      line: 'Bem-vindo, Gabriel.',
      curiosityKey: null,
    });
  });

  it('Conta com dados: uma curiosidade, e nunca a mesma da última vez', () => {
    const keys = curiosities(facts()).map((c) => c.key);
    for (const last of keys) {
      for (const roll of [0, 0.34, 0.67, 0.99]) {
        const picked = pickGreeting(facts(), last, () => roll);
        expect(picked.curiosityKey).not.toBeNull();
        expect(picked.curiosityKey).not.toBe(last);
      }
    }
  });

  it('só a curiosidade da última vez se aplica: volta às boas-vindas', () => {
    const only = facts({ viewer: null, week: null, days: [], totalSeconds: 4000 });

    expect(pickGreeting(only, 'hours').curiosityKey).toBeNull();
    expect(pickGreeting(only, null).curiosityKey).toBe('hours');
  });
});
