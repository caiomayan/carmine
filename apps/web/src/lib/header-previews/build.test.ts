import type { HeaderPreviews } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { buildHeaderView, type CatalogLookup } from './build';

const SERVER_ID = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';
const OTHER_ID = '1c0a9d2f-8b5e-4f3c-8d4b-6e7f8a901213';
const UID_A = '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';
const UID_B = '3c2e4d5f-6a71-4b8c-9d0e-1f2a3b4c5d6e';

const server = (over: Record<string, unknown> = {}) => ({
  id: SERVER_ID,
  name: 'retake-1',
  showcaseName: null,
  code: null,
  mode: 'retake' as const,
  address: '203.0.113.10:27015',
  region: 'sao-paulo' as const,
  map: 'de_mirage',
  players: 6,
  maxPlayers: 9,
  state: 'online' as const,
  lastHeartbeatAt: '2026-10-22T18:00:00.000Z',
  ...over,
});

const base = (over: Partial<HeaderPreviews> = {}): HeaderPreviews => ({
  generatedAt: '2026-10-22T18:00:05.000Z',
  signedIn: false,
  play: {
    recommended: { server: server(), reason: 'fullest', friends: [] },
    others: [],
    friendsPlaying: null,
  },
  loadout: null,
  inventory: null,
  ranking: {
    weekStart: '2026-10-19',
    weekEnd: '2026-10-25',
    closesAt: '2026-10-26T03:00:00.000Z',
    modes: [{ mode: 'retake', top: [], mine: null }],
  },
  ...over,
});

/** O catálogo de mentira: AK-47 | Linhas Vermelhas (222) e Karambit | Fade (41); o resto não existe. */
const lookup: CatalogLookup = {
  item: (id) =>
    id === 222
      ? { title: 'AK-47', subtitle: 'Linhas Vermelhas', image: '/ak.png', skinFirst: true }
      : id === 41
        ? { title: 'Karambit', subtitle: 'Fade', image: '/knife.png', skinFirst: true }
        : null,
  slotDefault: (slot) => ({
    name: slot === 'weapon_awp' ? 'AWP' : null,
    image: `/default-${slot}.png`,
  }),
};

describe('Jogar', () => {
  it('leva o servidor recomendado ao cartão dele na home, com o motivo e os amigos sem SteamID', () => {
    const view = buildHeaderView(
      base({
        signedIn: true,
        play: {
          recommended: {
            server: server({ showcaseName: 'Retake · Rotação' }),
            reason: 'friends',
            friends: [
              {
                steamId: '76561198000000001',
                publicId: 10_016,
                displayName: 'coldzera',
                avatarUrl: null,
                serverId: SERVER_ID,
              },
            ],
          },
          others: [],
          friendsPlaying: 1,
        },
      }),
      lookup,
    );

    expect(view.play.recommended).toMatchObject({
      id: SERVER_ID,
      href: `/#servidor-${SERVER_ID}`,
      name: 'Retake · Rotação',
      reason: 'friends',
      address: '203.0.113.10:27015',
    });
    expect(view.play.recommended?.friends).toEqual([
      { key: '10016', name: 'coldzera', avatarUrl: null, href: '/10016' },
    ]);
    expect(JSON.stringify(view)).not.toContain('76561198000000001');
    expect(view.play.friendsPlaying).toBe(1);
  });

  it('lista os outros servidores no ar, cada um com o link para o cartão', () => {
    const view = buildHeaderView(
      base({
        play: {
          recommended: { server: server(), reason: 'fullest', friends: [] },
          others: [
            server({ id: OTHER_ID, name: 'dm-1', mode: 'deathmatch', state: 'full', players: 9 }),
          ],
          friendsPlaying: null,
        },
      }),
      lookup,
    );

    expect(view.play.others).toEqual([
      expect.objectContaining({
        id: OTHER_ID,
        href: `/#servidor-${OTHER_ID}`,
        name: 'dm-1',
        state: 'full',
      }),
    ]);
  });

  it('sem servidor no ar, não há recomendado', () => {
    const view = buildHeaderView(
      base({ play: { recommended: null, others: [], friendsPlaying: null } }),
      lookup,
    );

    expect(view.play.recommended).toBeNull();
  });
});

describe('Loadout', () => {
  const loadout = (slots: NonNullable<HeaderPreviews['loadout']>['slots']) => ({
    side: 'ct' as const,
    presetId: UID_A,
    presetName: 'Principal',
    slots,
  });

  it('é nulo sem sessão, e o visitante recebe um Loadout de exemplo que leva ao /loadout', () => {
    const view = buildHeaderView(base(), lookup);

    expect(view.loadout).toBeNull();
    expect(view.example?.slots).toHaveLength(4);
    expect(view.example?.slots[0]).toMatchObject({
      slot: 'knife',
      equipped: true,
      title: 'Fade',
      href: '/loadout',
    });
    expect(view.example?.slots.every((slot) => slot.href === '/loadout')).toBe(true);
  });

  it('quem entrou não recebe o exemplo', () => {
    expect(buildHeaderView(base({ signedIn: true }), lookup).example).toBeNull();
  });

  it('mostra a skin em destaque e a arma como apoio, e leva cada Item ao editor', () => {
    const view = buildHeaderView(
      base({
        signedIn: true,
        loadout: loadout([
          { slot: 'knife', itemId: 41, uid: UID_A, statTrak: false },
          { slot: 'gloves', itemId: null, uid: null, statTrak: false },
          { slot: 'weapon_m4a1_silencer', itemId: 222, uid: UID_B, statTrak: true },
          { slot: 'weapon_awp', itemId: null, uid: null, statTrak: false },
        ]),
      }),
      lookup,
    );

    expect(view.loadout?.presetName).toBe('Principal');
    expect(view.loadout?.side).toBe('ct');
    const [knife, gloves, rifle, awp] = view.loadout?.slots ?? [];
    expect(knife).toMatchObject({
      slot: 'knife',
      equipped: true,
      title: 'Fade',
      caption: 'Karambit',
      href: `/inventario/${UID_A}`,
    });
    expect(rifle).toMatchObject({
      equipped: true,
      title: 'Linhas Vermelhas',
      caption: 'AK-47',
      statTrak: true,
      href: `/inventario/${UID_B}`,
    });
    // Slot sem Item: a arma padrão, que leva ao Loadout.
    expect(gloves).toMatchObject({
      equipped: false,
      title: null,
      href: '/loadout',
      image: '/default-gloves.png',
    });
    expect(awp).toMatchObject({ equipped: false, title: 'AWP', href: '/loadout' });
  });

  it('um Item que o catálogo não conhece cai no padrão do slot, sem quebrar', () => {
    const view = buildHeaderView(
      base({
        signedIn: true,
        loadout: loadout([
          { slot: 'knife', itemId: 99_999, uid: UID_A, statTrak: false },
          { slot: 'gloves', itemId: null, uid: null, statTrak: false },
          { slot: 'weapon_ak47', itemId: null, uid: null, statTrak: false },
          { slot: 'weapon_awp', itemId: null, uid: null, statTrak: false },
        ]),
      }),
      lookup,
    );

    expect(view.loadout?.slots[0]).toMatchObject({ equipped: false, href: '/loadout' });
  });
});

describe('Inventário', () => {
  it('mostra os últimos Itens, o total e o limite; cada um leva ao editor', () => {
    const view = buildHeaderView(
      base({
        signedIn: true,
        inventory: {
          total: 12,
          limit: 200,
          latest: [
            { uid: UID_A, itemId: 222, statTrak: true, createdAt: '2026-10-22T10:00:00.000Z' },
            { uid: UID_B, itemId: 41, statTrak: false, createdAt: '2026-10-21T10:00:00.000Z' },
          ],
        },
      }),
      lookup,
    );

    expect(view.inventory?.total).toBe(12);
    expect(view.inventory?.limit).toBe(200);
    expect(view.inventory?.latest).toEqual([
      {
        key: UID_A,
        title: 'Linhas Vermelhas',
        caption: 'AK-47',
        image: '/ak.png',
        href: `/inventario/${UID_A}`,
        statTrak: true,
      },
      {
        key: UID_B,
        title: 'Fade',
        caption: 'Karambit',
        image: '/knife.png',
        href: `/inventario/${UID_B}`,
        statTrak: false,
      },
    ]);
  });

  it('descarta o Item que o catálogo não conhece', () => {
    const view = buildHeaderView(
      base({
        signedIn: true,
        inventory: {
          total: 1,
          limit: 200,
          latest: [
            { uid: UID_A, itemId: 99_999, statTrak: false, createdAt: '2026-10-22T10:00:00.000Z' },
          ],
        },
      }),
      lookup,
    );

    expect(view.inventory?.latest).toEqual([]);
  });
});

describe('Ranking', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    position: 1,
    player: { private: false, publicId: 10_016, displayName: 'coldzera', avatarUrl: null },
    score: 40,
    kd: 1.5,
    headshotPercent: 50,
    roundsPlayed: 80,
    secondsPlayed: 3600,
    self: false,
    ...over,
  });

  it('leva cada Modo ao Ranking dele, o top 3 ao Perfil e a minha posição à minha linha', () => {
    const view = buildHeaderView(
      base({
        signedIn: true,
        ranking: {
          weekStart: '2026-10-19',
          weekEnd: '2026-10-25',
          closesAt: '2026-10-26T03:00:00.000Z',
          modes: [
            {
              mode: 'retake',
              top: [
                entry(),
                entry({
                  position: 2,
                  self: true,
                  player: { private: false, publicId: 10_017, displayName: 'eu', avatarUrl: null },
                }),
              ],
              mine: { position: 2, progress: null },
            },
            {
              mode: 'deathmatch',
              top: [],
              mine: { position: null, progress: { unit: 'minutes', missing: 12 } },
            },
          ],
        },
      }),
      lookup,
    );

    const [retake, dm] = view.ranking?.modes ?? [];
    expect(view.ranking?.closesAt).toBe('2026-10-26T03:00:00.000Z');
    expect(retake).toMatchObject({
      mode: 'retake',
      href: '/ranking?modo=retake',
      mine: { position: 2, progress: null, href: '/ranking?modo=retake#minha-linha' },
    });
    expect(retake?.top[0]).toMatchObject({
      position: 1,
      name: 'coldzera',
      href: '/10016',
      self: false,
    });
    expect(retake?.top[1]).toMatchObject({ self: true, href: '/10017' });
    expect(dm?.mine).toMatchObject({
      position: null,
      progress: { unit: 'minutes', missing: 12 },
      href: '/ranking?modo=deathmatch',
    });
  });

  it('o Perfil privado continua anônimo: sem link e sem nome verdadeiro', () => {
    const view = buildHeaderView(
      base({
        ranking: {
          weekStart: '2026-10-19',
          weekEnd: '2026-10-25',
          closesAt: '2026-10-26T03:00:00.000Z',
          modes: [
            {
              mode: 'retake',
              top: [
                entry({
                  player: {
                    private: true,
                    publicId: null,
                    displayName: 'Jogador privado',
                    avatarUrl: null,
                  },
                }),
              ],
              mine: null,
            },
          ],
        },
      }),
      lookup,
    );

    expect(view.ranking?.modes[0]?.top[0]).toMatchObject({
      name: 'Jogador privado',
      href: null,
      avatarUrl: null,
    });
  });

  it('sem sessão, não há "minha posição"', () => {
    const view = buildHeaderView(base(), lookup);

    expect(view.ranking?.modes[0]?.mine).toBeNull();
  });

  it('a seção que falhou vem nula e o resto continua', () => {
    const view = buildHeaderView(base({ ranking: null }), lookup);

    expect(view.ranking).toBeNull();
    expect(view.play.recommended).not.toBeNull();
  });
});
