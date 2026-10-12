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
  sanctions: { active: [], history: [] },
};

describe('profileSchema', () => {
  it('aceita um Perfil com o avatar neutro e a vitrine vazia', () => {
    expect(profileSchema.parse(profile)).toEqual(profile);
  });

  it('aceita a vitrine com os Itens equipados, por slot e lado', () => {
    const items = [
      { slot: 'weapon_ak47', side: 't', item: { id: 222, wear: 0.15, seed: 661 } },
      { slot: 'musicKit', side: null, item: { id: 1780 } },
    ];
    const withItems = { ...profile, loadoutShowcase: { items } };

    expect(profileSchema.parse(withItems)).toEqual(withItems);
  });

  it('rejeita na vitrine um slot que não existe', () => {
    const items = [{ slot: 'ak47', side: 't', item: { id: 222 } }];

    expect(profileSchema.safeParse({ ...profile, loadoutShowcase: { items } }).success).toBe(false);
  });
});

const vip = { active: false, endsAt: null, endedAt: null };

describe('currentSessionSchema', () => {
  it('diz se a sessão é a do primeiro login da Conta', () => {
    const session = {
      account: profile,
      csrfToken: 'token',
      firstLogin: true,
      vip,
      staffRole: null,
    };

    expect(currentSessionSchema.parse(session)).toEqual(session);
    expect(
      currentSessionSchema.safeParse({ account: profile, csrfToken: 'token', vip }).success,
    ).toBe(false);
  });

  it('traz o Período VIP da Conta', () => {
    const session = { account: profile, csrfToken: 'token', firstLogin: false, staffRole: null };
    const active = { active: true, endsAt: '2026-11-10T12:00:00.000Z', endedAt: null };

    expect(currentSessionSchema.parse({ ...session, vip: active }).vip).toEqual(active);
    expect(currentSessionSchema.safeParse(session).success).toBe(false);
  });
});
