import type {
  InventoryItem,
  Loadout,
  LoadoutEntry,
  LoadoutSide,
  Ranking,
  RankingEntry,
} from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { inventoryPreview, loadoutPreview, rankingModePreview } from './previews.js';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const owned = (n: number, id: number, over: { statTrak?: number } = {}): InventoryItem => ({
  uid: uid(n),
  item: { id, ...over },
  createdAt: `2026-10-22T1${n}:00:00.000Z`,
  updatedAt: `2026-10-22T1${n}:00:00.000Z`,
});

const entry = (slot: string, side: LoadoutSide, itemUid: string | null): LoadoutEntry => ({
  slot,
  side,
  group: slot.startsWith('weapon_') ? 'rifle' : 'knife',
  def: null,
  uid: itemUid,
  notInGame: null,
  strippedInGame: [],
});

const loadout = (entries: LoadoutEntry[]): Loadout => ({
  presetId: uid(900),
  presetName: 'Principal',
  active: true,
  readOnly: false,
  readOnlyReason: null,
  entries,
});

const byUid = (...items: InventoryItem[]) => new Map(items.map((item) => [item.uid, item]));

describe('loadoutPreview', () => {
  it('traz faca, luvas, o rifle do lado e a AWP, com os ids dos Itens equipados', () => {
    const knife = owned(1, 41);
    const gloves = owned(2, 56);
    const ak = owned(3, 222, { statTrak: 0 });
    const awp = owned(4, 306);
    const preview = loadoutPreview(
      loadout([
        entry('knife', 't', knife.uid),
        entry('gloves', 't', gloves.uid),
        entry('weapon_ak47', 't', ak.uid),
        entry('weapon_awp', 't', awp.uid),
      ]),
      byUid(knife, gloves, ak, awp),
      't',
    );

    expect(preview).toEqual({
      side: 't',
      presetId: uid(900),
      presetName: 'Principal',
      slots: [
        { slot: 'knife', itemId: 41, uid: knife.uid, statTrak: false },
        { slot: 'gloves', itemId: 56, uid: gloves.uid, statTrak: false },
        { slot: 'weapon_ak47', itemId: 222, uid: ak.uid, statTrak: true },
        { slot: 'weapon_awp', itemId: 306, uid: awp.uid, statTrak: false },
      ],
    });
  });

  it('só olha o lado pedido: o outro lado não vaza para o retrato', () => {
    const ctKnife = owned(1, 41);
    const tKnife = owned(2, 42);
    const preview = loadoutPreview(
      loadout([entry('knife', 'ct', ctKnife.uid), entry('knife', 't', tKnife.uid)]),
      byUid(ctKnife, tKnife),
      'ct',
    );

    expect(preview.slots[0]).toMatchObject({ slot: 'knife', itemId: 41 });
  });

  it('slot sem Item equipado é a arma padrão: ids nulos', () => {
    const preview = loadoutPreview(loadout([entry('knife', 'ct', null)]), byUid(), 'ct');

    expect(preview.slots.map((slot) => [slot.slot, slot.itemId, slot.uid])).toEqual([
      ['knife', null, null],
      ['gloves', null, null],
      ['weapon_m4a1', null, null],
      ['weapon_awp', null, null],
    ]);
  });

  describe('o rifle do CT', () => {
    it('é a M4A1-S quando ela está equipada', () => {
      const s = owned(1, 600);
      const four = owned(2, 601);
      const preview = loadoutPreview(
        loadout([entry('weapon_m4a1_silencer', 'ct', s.uid), entry('weapon_m4a1', 'ct', four.uid)]),
        byUid(s, four),
        'ct',
      );

      expect(preview.slots[2]).toMatchObject({ slot: 'weapon_m4a1_silencer', itemId: 600 });
    });

    it('é a M4A4 quando só ela está equipada', () => {
      const four = owned(2, 601);
      const preview = loadoutPreview(
        loadout([entry('weapon_m4a1_silencer', 'ct', null), entry('weapon_m4a1', 'ct', four.uid)]),
        byUid(four),
        'ct',
      );

      expect(preview.slots[2]).toMatchObject({ slot: 'weapon_m4a1', itemId: 601 });
    });
  });

  it('Item que saiu do Inventário (uid sem Item) vira o padrão, sem quebrar', () => {
    const preview = loadoutPreview(loadout([entry('knife', 'ct', uid(77))]), byUid(), 'ct');

    expect(preview.slots[0]).toEqual({ slot: 'knife', itemId: null, uid: null, statTrak: false });
  });
});

describe('inventoryPreview', () => {
  it('conta todos e lista os 4 mais novos, na ordem em que vieram', () => {
    const items = [6, 5, 4, 3, 2, 1].map((n) => owned(n, 100 + n));

    const preview = inventoryPreview(items);

    expect(preview.total).toBe(6);
    expect(preview.limit).toBe(300);
    expect(preview.latest.map((item) => item.itemId)).toEqual([106, 105, 104, 103]);
    expect(preview.latest[0]).toEqual({
      uid: uid(6),
      itemId: 106,
      statTrak: false,
      createdAt: '2026-10-22T16:00:00.000Z',
    });
  });

  it('Inventário vazio: total 0 e nada recente', () => {
    expect(inventoryPreview([])).toEqual({ total: 0, limit: 300, latest: [] });
  });
});

describe('rankingModePreview', () => {
  const line = (position: number): RankingEntry => ({
    position,
    player: {
      private: false,
      publicId: 10_000 + position,
      displayName: `p${position}`,
      avatarUrl: null,
    },
    score: 10 - position,
    kd: 1,
    headshotPercent: null,
    roundsPlayed: 100,
    secondsPlayed: 3600,
    self: false,
  });
  const ranking = (over: Partial<Ranking> = {}): Ranking => ({
    mode: 'retake',
    weekStart: '2026-10-19',
    weekEnd: '2026-10-25',
    current: true,
    minimum: { unit: 'rounds', value: 100 },
    entries: [1, 2, 3, 4, 5].map(line),
    weeks: ['2026-10-19'],
    viewer: null,
    ...over,
  });

  it('corta no top 3; sem sessão, não há "minha posição"', () => {
    const preview = rankingModePreview(ranking());

    expect(preview.top.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(preview.mine).toBeNull();
  });

  it('com sessão traz a própria posição, mesmo fora do top', () => {
    const preview = rankingModePreview(
      ranking({ viewer: { entry: { ...line(17), self: true }, progress: null, removed: false } }),
    );

    expect(preview.mine).toEqual({ position: 17, progress: null });
  });

  it('sem posição ainda: quanto falta para o mínimo', () => {
    const preview = rankingModePreview(
      ranking({
        viewer: { entry: null, progress: { unit: 'rounds', missing: 40 }, removed: false },
      }),
    );

    expect(preview.mine).toEqual({ position: null, progress: { unit: 'rounds', missing: 40 } });
  });

  it('Perfil privado continua anônimo no top', () => {
    const anonymous = {
      ...line(1),
      player: { private: true, publicId: null, displayName: 'Jogador privado', avatarUrl: null },
    };

    const preview = rankingModePreview(ranking({ entries: [anonymous] }));

    expect(preview.top[0]?.player).toMatchObject({ private: true, publicId: null });
  });
});
