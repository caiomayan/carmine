import { describe, expect, it } from 'vitest';
import { canSeeStats, PRIVATE_PLAYER_NAME, rankingIdentity } from './profile-privacy.js';

const owner = { id: 'conta-1', publicId: 10_016, displayName: 'coldzera', avatarUrl: null };

describe('canSeeStats', () => {
  it('Perfil público: qualquer visitante vê as Estatísticas', () => {
    expect(canSeeStats({ id: 'conta-1', profilePrivate: false }, null)).toBe(true);
    expect(canSeeStats({ id: 'conta-1', profilePrivate: false }, 'conta-2')).toBe(true);
  });

  it('Perfil privado: nem o visitante sem sessão nem outra Conta veem', () => {
    expect(canSeeStats({ id: 'conta-1', profilePrivate: true }, null)).toBe(false);
    expect(canSeeStats({ id: 'conta-1', profilePrivate: true }, 'conta-2')).toBe(false);
  });

  it('Perfil privado: a própria Conta continua vendo as suas Estatísticas', () => {
    expect(canSeeStats({ id: 'conta-1', profilePrivate: true }, 'conta-1')).toBe(true);
  });
});

describe('rankingIdentity', () => {
  it('Perfil público: aparece com nome, ID e avatar', () => {
    expect(rankingIdentity({ ...owner, profilePrivate: false })).toEqual({
      private: false,
      publicId: 10_016,
      displayName: 'coldzera',
      avatarUrl: null,
    });
  });

  it('Perfil privado: aparece só como "Jogador privado", sem ID, nome nem avatar', () => {
    const identity = rankingIdentity({
      ...owner,
      avatarUrl: 'https://x/y.jpg',
      profilePrivate: true,
    });

    expect(identity).toEqual({ private: true, displayName: PRIVATE_PLAYER_NAME });
    expect(JSON.stringify(identity)).not.toMatch(/coldzera|10016|x\/y/);
  });
});
