import { describe, expect, it } from 'vitest';
import { profileSchema } from './profile.js';

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
