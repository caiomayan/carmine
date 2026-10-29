import { describe, expect, it } from 'vitest';
import {
  changeDisplayNameInputSchema,
  currentSessionSchema,
  displayNameChangeSchema,
  profilePlayingSchema,
  profileSchema,
} from './profile.js';

const profile = {
  publicId: 10_016,
  displayName: 'coldzera',
  avatarUrl: null,
  steamId: '76561198000000001',
  steamProfileUrl: 'https://steamcommunity.com/profiles/76561198000000001',
  claimed: false,
  memberSince: '2026-09-02T14:30:00.000Z',
  isVip: false,
  loadoutShowcase: { items: [] },
  sanctions: { active: [], history: [] },
  isPrivate: false,
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
      vipHoldDays: null,
      staffRole: null,
      sanctions: [],
      displayNameChange: { custom: false, nextChangeAt: null },
    };

    expect(currentSessionSchema.parse(session)).toEqual(session);
    expect(currentSessionSchema.parse({ ...session, vipHoldDays: 30 }).vipHoldDays).toBe(30);
    expect(currentSessionSchema.safeParse({ ...session, vipHoldDays: 0 }).success).toBe(false);
    expect(currentSessionSchema.safeParse({ ...session, vipHoldDays: undefined }).success).toBe(
      false,
    );
    expect(
      currentSessionSchema.safeParse({ account: profile, csrfToken: 'token', vip }).success,
    ).toBe(false);
  });

  it('traz o Período VIP da Conta', () => {
    const session = {
      account: profile,
      csrfToken: 'token',
      firstLogin: false,
      vipHoldDays: null,
      staffRole: null,
      sanctions: [],
      displayNameChange: { custom: false, nextChangeAt: null },
    };
    const active = { active: true, endsAt: '2026-11-10T12:00:00.000Z', endedAt: null };

    expect(currentSessionSchema.parse({ ...session, vip: active }).vip).toEqual(active);
    expect(currentSessionSchema.safeParse(session).success).toBe(false);
  });
});

describe('Perfil privado e troca de nome (S11)', () => {
  it('o Perfil diz se é privado; sem o campo, não vale', () => {
    expect(profileSchema.parse({ ...profile, isPrivate: true }).isPrivate).toBe(true);
    const { isPrivate: _, ...without } = profile;
    expect(profileSchema.safeParse(without).success).toBe(false);
  });

  it('displayNameChange: quando a troca fica livre, em ISO com fuso', () => {
    const change = { custom: true, nextChangeAt: '2026-10-25T12:00:00.000Z' };
    expect(displayNameChangeSchema.parse(change)).toEqual(change);
    expect(
      displayNameChangeSchema.safeParse({ custom: true, nextChangeAt: 'amanhã' }).success,
    ).toBe(false);
  });

  it('o nome da troca é texto de tamanho limitado (o servidor normaliza)', () => {
    expect(changeDisplayNameInputSchema.safeParse({ displayName: 'Fer' }).success).toBe(true);
    expect(changeDisplayNameInputSchema.safeParse({ displayName: 'a'.repeat(201) }).success).toBe(
      false,
    );
    expect(changeDisplayNameInputSchema.safeParse({}).success).toBe(false);
  });
});

describe('identidade do Perfil público', () => {
  it('exige a data de entrada e o selo VIP', () => {
    const { memberSince: _since, ...withoutSince } = profile;
    const { isVip: _vip, ...withoutVip } = profile;

    expect(profileSchema.safeParse(withoutSince).success).toBe(false);
    expect(profileSchema.safeParse(withoutVip).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, memberSince: 'ontem' }).success).toBe(false);
  });

  it('o VIP no Perfil é só o selo: o fim do Período não viaja', () => {
    expect(profileSchema.parse({ ...profile, isVip: true, vipEndsAt: 'x' })).toEqual({
      ...profile,
      isVip: true,
    });
  });
});

describe('profilePlayingSchema', () => {
  const server = {
    id: '3f9c8b1e-7a52-4c1e-9d3a-2f6a8e0b4c11',
    name: 'retake-1',
    showcaseName: 'Retake · Rotação',
    mode: 'retake',
    map: 'de_mirage',
    address: '177.54.0.10:27015',
    state: 'online',
  };

  it('aceita o servidor com endereço e estado, ou nulo', () => {
    expect(profilePlayingSchema.parse({ server })).toEqual({ server });
    expect(profilePlayingSchema.parse({ server: null })).toEqual({ server: null });
  });

  it('exige o endereço (o "Entrar junto" abre o steam://connect)', () => {
    const { address: _address, ...withoutAddress } = server;

    expect(profilePlayingSchema.safeParse({ server: withoutAddress }).success).toBe(false);
  });
});
