import type { FriendsPlaying, RankingViewer } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { buildPlayerCard } from './player-cards.js';

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

const friend = (n: number) => ({
  steamId: `7656119800000000${n}`,
  publicId: 10_000 + n,
  displayName: `amigo${n}`,
  avatarUrl: null,
  serverId: '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102',
});

const facts = (over: Partial<Parameters<typeof buildPlayerCard>[0]> = {}) => ({
  mode: 'retake' as const,
  displayName: 'Gabriel',
  vipActive: true,
  viewer: inRanking,
  friends: { status: 'ok', friends: [friend(1), friend(2), friend(3)] } as FriendsPlaying,
  ...over,
});

describe('card de boas-vindas', () => {
  it('monta os textos em português para quem tem tudo', () => {
    expect(buildPlayerCard(facts())).toEqual({
      name: 'Gabriel',
      plan: 'VIP',
      rank: '8º no Ranking de Retake',
      friends: '3 amigos online',
      rating: '',
    });
  });

  it('linha sem dado vem vazia: sem plano, fora do Ranking, sem amigos, sem Steam', () => {
    const card = buildPlayerCard(
      facts({ vipActive: false, viewer: null, friends: { status: 'unavailable' } }),
    );

    expect(card).toEqual({ name: 'Gabriel', plan: '', rank: '', friends: '', rating: '' });
  });

  it('fora do mínimo do Ranking, diz quanto falta, no singular e no plural', () => {
    const outside = (missing: number): RankingViewer => ({
      entry: null,
      progress: { unit: 'rounds', missing },
      removed: false,
    });

    expect(buildPlayerCard(facts({ viewer: outside(12) })).rank).toBe('Faltam 12 rounds para o Ranking');
    expect(buildPlayerCard(facts({ viewer: outside(1) })).rank).toBe('Falta 1 round para o Ranking');
  });

  it('um amigo online fala no singular, e nenhum não escreve nada', () => {
    expect(
      buildPlayerCard(facts({ friends: { status: 'private', friends: [friend(1)] } })).friends,
    ).toBe('1 amigo online');
    expect(buildPlayerCard(facts({ friends: { status: 'ok', friends: [] } })).friends).toBe('');
  });

  it('no Deathmatch o Ranking fala de Deathmatch', () => {
    expect(buildPlayerCard(facts({ mode: 'deathmatch' })).rank).toBe('8º no Ranking de Deathmatch');
  });
});
