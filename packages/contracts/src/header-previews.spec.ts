import { describe, expect, it } from 'vitest';
import { HEADER_LATEST_ITEMS, headerPreviewsSchema } from './header-previews.js';

const SERVER_ID = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';
const UID = '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';

const server = {
  id: SERVER_ID,
  name: 'retake-1',
  showcaseName: 'Retake · Rotação',
  code: 'SP·1',
  mode: 'retake',
  address: '203.0.113.10:27015',
  region: 'sao-paulo',
  map: 'de_mirage',
  players: 6,
  maxPlayers: 9,
  state: 'online',
  lastHeartbeatAt: '2026-10-22T18:00:00.000Z',
};

const anonymous = {
  generatedAt: '2026-10-22T18:00:05.000Z',
  signedIn: false,
  play: {
    recommended: { server, reason: 'fullest', friends: [] },
    others: [],
    friendsPlaying: null,
  },
  loadout: null,
  inventory: null,
  ranking: {
    weekStart: '2026-10-19',
    weekEnd: '2026-10-25',
    closesAt: '2026-10-26T03:00:00.000Z',
    modes: [
      { mode: 'retake', top: [], mine: null },
      { mode: 'deathmatch', top: [], mine: null },
    ],
  },
};

describe('headerPreviewsSchema', () => {
  it('aceita a resposta sem sessão: partes pessoais nulas', () => {
    expect(headerPreviewsSchema.parse(anonymous)).toEqual(anonymous);
  });

  it('aceita a resposta com sessão: Loadout de 4 slots, Inventário e a minha posição', () => {
    const signedIn = {
      ...anonymous,
      signedIn: true,
      play: { ...anonymous.play, friendsPlaying: 2 },
      loadout: {
        side: 'ct',
        presetId: UID,
        presetName: 'Principal',
        slots: [
          { slot: 'knife', itemId: 41, uid: UID, statTrak: false },
          { slot: 'gloves', itemId: null, uid: null, statTrak: false },
          { slot: 'weapon_m4a1_silencer', itemId: 222, uid: UID, statTrak: true },
          { slot: 'weapon_awp', itemId: null, uid: null, statTrak: false },
        ],
      },
      inventory: {
        total: 1,
        limit: 300,
        latest: [{ uid: UID, itemId: 222, statTrak: false, createdAt: '2026-10-22T17:00:00.000Z' }],
      },
      ranking: {
        ...anonymous.ranking,
        modes: [
          { mode: 'retake', top: [], mine: { position: 7, progress: null } },
          {
            mode: 'deathmatch',
            top: [],
            mine: { position: null, progress: { unit: 'minutes', missing: 12 } },
          },
        ],
      },
    };

    expect(headerPreviewsSchema.parse(signedIn)).toEqual(signedIn);
  });

  it('o retrato do Loadout tem sempre 4 slots', () => {
    const loadout = { side: 't', presetId: UID, presetName: 'Principal', slots: [] };

    expect(headerPreviewsSchema.safeParse({ ...anonymous, loadout }).success).toBe(false);
  });

  it('lista no máximo 4 Itens recentes, 3 outros servidores e 3 linhas do topo', () => {
    const item = { uid: UID, itemId: 1, statTrak: false, createdAt: '2026-10-22T17:00:00.000Z' };
    const tooManyItems = {
      ...anonymous,
      inventory: { total: 9, limit: 300, latest: Array(HEADER_LATEST_ITEMS + 1).fill(item) },
    };
    const tooManyServers = {
      ...anonymous,
      play: { ...anonymous.play, others: Array(4).fill(server) },
    };

    expect(headerPreviewsSchema.safeParse(tooManyItems).success).toBe(false);
    expect(headerPreviewsSchema.safeParse(tooManyServers).success).toBe(false);
  });

  it('o motivo da recomendação é um dos três', () => {
    const reason = { ...anonymous.play.recommended, reason: 'aleatorio' };

    expect(
      headerPreviewsSchema.safeParse({
        ...anonymous,
        play: { ...anonymous.play, recommended: reason },
      }).success,
    ).toBe(false);
  });
});
