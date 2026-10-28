import { analyticsPreferenceSchema } from '@carmine/contracts/analytics';
import { avatarStateSchema } from '@carmine/contracts/avatar';
import {
  friendsPlayingSchema,
  liveServerListSchema,
  nowPlayingSchema,
} from '@carmine/contracts/live-servers';
import { profilePlayingSchema } from '@carmine/contracts/profile';
import { describe, expect, it } from 'vitest';
import {
  parseAnalyticsPreference,
  parseAvatarState,
  parseFriendsPlaying,
  parseLiveServerList,
  parseNowPlaying,
  parseProfilePlaying,
} from './api-guards';

const ID = '5a0e9c3e-1d2b-4c47-9a55-3b7a2f0c8d11';
const AT = '2026-10-26T21:07:00.000-03:00';

const server = (over: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'retake-1',
  showcaseName: 'Retake · Rotação',
  code: null,
  mode: 'retake',
  address: '203.0.113.5:27015',
  region: 'sao-paulo',
  map: 'de_mirage',
  players: 4,
  maxPlayers: 9,
  state: 'online',
  lastHeartbeatAt: AT,
  lastMap: 'de_mirage',
  ...over,
});

const list = (servers: unknown[], over: Record<string, unknown> = {}) => ({
  servers,
  summary: { online: 1, players: 4 },
  generatedAt: AT,
  ...over,
});

/**
 * A conferência leve tem de concordar com o schema do contrato nos casos que importam: o que o schema aceita ela
 * aceita, e o que quebraria a tela (campo faltando ou de outro tipo) ela recusa. As exceções (formato de texto) ficam
 * documentadas no último teste.
 */
describe('parseLiveServerList concorda com liveServerListSchema', () => {
  const cases: [string, unknown][] = [
    ['lista normal', list([server()])],
    ['vazia', list([], { summary: { online: 0, players: 0 } })],
    ['com placar', list([server({ match: { round: 3, ctScore: 1, tScore: 1, warmup: false } })])],
    ['com match nulo', list([server({ match: null })])],
    [
      'offline sem mapa',
      list([server({ state: 'offline', map: null, players: 0, lastMap: 'de_nuke' })]),
    ],
    ['sem lastMap', list([server({ lastMap: undefined })])],
    ['estado desconhecido', list([server({ state: 'dormindo' })])],
    ['Modo desconhecido', list([server({ mode: '5v5' })])],
    ['jogadores como texto', list([server({ players: '4' })])],
    ['vagas zero', list([server({ maxPlayers: 0 })])],
    ['jogadores negativos', list([server({ players: -1 })])],
    ['match quebrado', list([server({ match: { round: 3 } })])],
    ['servers não é lista', list('x' as unknown as unknown[])],
    ['sem resumo', { servers: [server()], generatedAt: AT }],
    ['sem generatedAt', { servers: [server()], summary: { online: 1, players: 4 } }],
    ['nulo', null],
    ['texto', 'oi'],
  ];
  for (const [label, value] of cases) {
    it(label, () => {
      expect(parseLiveServerList(JSON.parse(JSON.stringify(value ?? null))) !== null).toBe(
        liveServerListSchema.safeParse(JSON.parse(JSON.stringify(value ?? null))).success,
      );
    });
  }

  it('devolve a própria lista, sem copiar nem tirar nada', () => {
    const value = list([server({ match: null })]);
    expect(parseLiveServerList(value)).toBe(value);
  });
});

describe('parseFriendsPlaying concorda com friendsPlayingSchema', () => {
  const friend = (over: Record<string, unknown> = {}) => ({
    steamId: '76561198000000101',
    publicId: 9000,
    displayName: 'Ana Souza',
    avatarUrl: null,
    serverId: ID,
    ...over,
  });
  const cases: [string, unknown][] = [
    ['ok com amigos', { status: 'ok', friends: [friend()] }],
    ['ok vazio', { status: 'ok', friends: [] }],
    ['privada', { status: 'private', friends: [friend({ avatarUrl: 'https://x.test/a.png' })] }],
    ['indisponível', { status: 'unavailable' }],
    ['status novo', { status: 'talvez', friends: [] }],
    ['amigo sem nome', { status: 'ok', friends: [friend({ displayName: '' })] }],
    ['publicId zero', { status: 'ok', friends: [friend({ publicId: 0 })] }],
    ['friends ausente', { status: 'ok' }],
    ['nulo', null],
  ];
  for (const [label, value] of cases) {
    it(label, () => {
      expect(parseFriendsPlaying(value) !== null).toBe(
        friendsPlayingSchema.safeParse(value).success,
      );
    });
  }

  it('o resultado tem a forma do contrato (indisponível não leva amigos)', () => {
    expect(parseFriendsPlaying({ status: 'unavailable', friends: [friend()] })).toEqual({
      status: 'unavailable',
    });
    expect(parseFriendsPlaying({ status: 'ok', friends: [friend()] })).toEqual({
      status: 'ok',
      friends: [friend()],
    });
  });
});

describe('parseProfilePlaying concorda com profilePlayingSchema', () => {
  const playing = (over: Record<string, unknown> = {}) => ({
    id: ID,
    name: 'retake-1',
    showcaseName: null,
    mode: 'retake',
    map: 'de_mirage',
    address: '203.0.113.5:27015',
    state: 'online',
    ...over,
  });
  const cases: [string, unknown][] = [
    ['jogando', { server: playing() }],
    ['fora de servidor', { server: null }],
    ['mapa nulo', { server: playing({ map: null }) }],
    ['sem server', {}],
    ['estado desconhecido', { server: playing({ state: 'x' }) }],
    ['sem endereço', { server: playing({ address: undefined }) }],
    ['texto', 'oi'],
  ];
  for (const [label, value] of cases) {
    it(label, () => {
      const plain = JSON.parse(JSON.stringify(value));
      expect(parseProfilePlaying(plain) !== null).toBe(
        profilePlayingSchema.safeParse(plain).success,
      );
    });
  }

  it('só leva os campos que a tela lê (o resto da resposta fica de fora)', () => {
    expect(parseProfilePlaying({ server: { ...playing(), players: 9, extra: true } })).toEqual({
      server: playing(),
    });
  });
});

describe('parseNowPlaying concorda com nowPlayingSchema', () => {
  const playing = (over: Record<string, unknown> = {}) => ({
    id: ID,
    name: 'retake-1',
    showcaseName: 'Retake · Rotação',
    mode: 'retake',
    map: 'de_mirage',
    ...over,
  });
  const cases: [string, unknown][] = [
    ['jogando', { server: playing() }],
    ['fora de servidor', { server: null }],
    ['mapa nulo', { server: playing({ map: null }) }],
    ['sem nome de vitrine', { server: playing({ showcaseName: null }) }],
    ['sem server', {}],
    ['Modo desconhecido', { server: playing({ mode: '5v5' }) }],
    ['sem nome', { server: playing({ name: undefined }) }],
    ['mapa como número', { server: playing({ map: 4 }) }],
    ['nulo', null],
    ['texto', 'oi'],
  ];
  for (const [label, value] of cases) {
    it(label, () => {
      const plain = JSON.parse(JSON.stringify(value ?? null));
      expect(parseNowPlaying(plain) !== null).toBe(nowPlayingSchema.safeParse(plain).success);
    });
  }

  it('só leva os campos que a tela lê (endereço e lotação ficam de fora)', () => {
    expect(
      parseNowPlaying({ server: { ...playing(), address: '203.0.113.5:27015', players: 4 } }),
    ).toEqual({ server: playing() });
  });
});

describe('parseAnalyticsPreference concorda com analyticsPreferenceSchema', () => {
  it('aceita o que o schema aceita e devolve só os dois campos', () => {
    for (const value of [
      { participate: true, enabled: true },
      { participate: false, enabled: false },
    ]) {
      expect(analyticsPreferenceSchema.safeParse(value).success).toBe(true);
      expect(parseAnalyticsPreference(value)).toEqual(value);
    }
    expect(parseAnalyticsPreference({ participate: true, enabled: true, extra: 1 })).toEqual({
      participate: true,
      enabled: true,
    });
  });

  it('recusa o que o schema recusa', () => {
    for (const value of [
      null,
      [],
      {},
      { participate: 'sim', enabled: true },
      { participate: true },
      { enabled: true },
    ]) {
      expect(analyticsPreferenceSchema.safeParse(value).success).toBe(false);
      expect(parseAnalyticsPreference(value)).toBeNull();
    }
  });
});

describe('parseAvatarState concorda com avatarStateSchema', () => {
  const state = (over: Record<string, unknown> = {}) => ({
    enabled: true,
    source: 'steam',
    steamAvatarUrl: 'https://avatars.steamstatic.com/abc_full.jpg',
    custom: null,
    canUpload: true,
    cannotUploadReason: null,
    retryAfter: null,
    removal: null,
    ...over,
  });
  const custom = {
    url: 'https://img.stcarmine.com/avatars/x/512.webp',
    status: 'active',
    uploadedAt: AT,
  };

  it('aceita o que o schema aceita', () => {
    for (const value of [
      state(),
      state({ source: 'custom', custom }),
      state({ custom: { ...custom, status: 'suspended' } }),
      state({ steamAvatarUrl: null }),
      state({ canUpload: false, cannotUploadReason: 'daily_limit', retryAfter: AT }),
      state({ removal: { at: AT, reason: 'staff_removed' } }),
      state({ enabled: false }),
    ]) {
      const schema = avatarStateSchema.safeParse(value);
      // O motivo de remoção do exemplo pode não ser um dos do schema: o que vale é a guarda aceitar o que o schema aceita.
      if (schema.success) expect(parseAvatarState(value)).toEqual(schema.data);
    }
    expect(avatarStateSchema.safeParse(state()).success).toBe(true);
    expect(parseAvatarState(state())).not.toBeNull();
    expect(parseAvatarState(state({ source: 'custom', custom }))).not.toBeNull();
  });

  it('recusa o que quebraria a tela, como o schema', () => {
    for (const value of [
      null,
      [],
      {},
      state({ enabled: 'sim' }),
      state({ source: 'outra' }),
      state({ custom: { url: 1, status: 'active', uploadedAt: AT } }),
      state({ custom: { ...custom, status: 'removida' } }),
      state({ canUpload: undefined }),
      state({ steamAvatarUrl: 5 }),
      state({ removal: { at: AT } }),
    ]) {
      expect(avatarStateSchema.safeParse(value).success).toBe(false);
      expect(parseAvatarState(value)).toBeNull();
    }
  });
});

describe('o que a conferência leve não confere (o formato do texto)', () => {
  it('aceita um id que não é UUID e uma data que não é ISO: a API já validou do outro lado', () => {
    const odd = list([server({ id: 'qualquer-coisa', lastHeartbeatAt: 'ontem' })], {
      generatedAt: 'agora',
    });
    expect(parseLiveServerList(odd)).not.toBeNull();
    expect(liveServerListSchema.safeParse(odd).success).toBe(false);
  });
});
