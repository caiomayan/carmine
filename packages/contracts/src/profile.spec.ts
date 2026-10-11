import { describe, expect, it } from 'vitest';
import { currentSessionSchema, profileSchema } from './profile.js';

const profile = {
  publicId: 10_016,
  displayName: 'coldzera',
  avatarUrl: null,
  steamId: '76561198000000001',
  steamProfileUrl: 'https://steamcommunity.com/profiles/76561198000000001',
  claimed: false,
  loadoutShowcase: { items: [] },
};

describe('profileSchema', () => {
  it('aceita um Perfil com o avatar neutro e a vitrine vazia', () => {
    expect(profileSchema.parse(profile)).toEqual(profile);
  });

  it('rejeita itens na vitrine enquanto não existe Loadout', () => {
    const withItem = { ...profile, loadoutShowcase: { items: [{ def: 7 }] } };

    expect(profileSchema.safeParse(withItem).success).toBe(false);
  });
});

const vip = { active: false, endsAt: null };

describe('currentSessionSchema', () => {
  it('diz se a sessão é a do primeiro login da Conta', () => {
    const session = { account: profile, csrfToken: 'token', firstLogin: true, vip };

    expect(currentSessionSchema.parse(session)).toEqual(session);
    expect(
      currentSessionSchema.safeParse({ account: profile, csrfToken: 'token', vip }).success,
    ).toBe(false);
  });

  it('traz o Período VIP da Conta', () => {
    const session = { account: profile, csrfToken: 'token', firstLogin: false };
    const active = { active: true, endsAt: '2026-11-10T12:00:00.000Z' };

    expect(currentSessionSchema.parse({ ...session, vip: active }).vip).toEqual(active);
    expect(currentSessionSchema.safeParse(session).success).toBe(false);
  });
});
