import type { InventoryItem, Preset, PresetList } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { buildHand } from './hand-build';

// Ids da @ianlucas/cs2-lib 9.5.0 (fixada no package.json).
const AK_REDLINE = 222;
const M4A1S = 1089;
const BAYONET = 1211;

const AK = '00000000-0000-4000-8000-000000000001';
const KNIFE = '00000000-0000-4000-8000-000000000002';
const M4 = '00000000-0000-4000-8000-000000000003';
const GONE = '00000000-0000-4000-8000-000000000009';

const stamp = '2026-10-11T12:00:00.000Z';
const owned = (uid: string, id: number): InventoryItem => ({
  uid,
  item: { id },
  createdAt: stamp,
  updatedAt: stamp,
});
const items = [owned(AK, AK_REDLINE), owned(KNIFE, BAYONET), owned(M4, M4A1S)];

const preset = (over: Partial<Preset> = {}): Preset => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  name: 'Principal',
  main: true,
  active: true,
  readOnly: false,
  readOnlyReason: null,
  equippedCount: 0,
  highlights: [],
  createdAt: stamp,
  updatedAt: stamp,
  ...over,
});
const list = (...presets: Preset[]): PresetList => ({ presets, limit: 20 });

describe('buildHand', () => {
  it('uma carta por Preset, na ordem da lista, com o que o Preset tem de nome e estado', () => {
    const hand = buildHand(
      list(
        preset(),
        preset({
          id: '00000000-0000-4000-8000-0000000000bb',
          name: 'Retake',
          main: false,
          active: false,
          equippedCount: 7,
        }),
      ),
      items,
    );

    expect(hand.map((card) => [card.name, card.main, card.active, card.equippedCount])).toEqual([
      ['Principal', true, true, 0],
      ['Retake', false, false, 7],
    ]);
  });

  it('a frente de cada lado: faca, luvas e o rifle daquele lado, com nome e imagem do catálogo', () => {
    const [card] = buildHand(
      list(
        preset({
          highlights: [
            { slot: 'knife', side: 'ct', uid: KNIFE },
            { slot: 'knife', side: 't', uid: KNIFE },
            { slot: 'weapon_ak47', side: 't', uid: AK },
          ],
        }),
      ),
      items,
    );

    expect(card?.front.t.knife).toMatchObject({ uid: KNIFE, rarity: expect.any(String) });
    expect(card?.front.t.knife.image).toMatch(/^https?:/);
    expect(card?.front.t.rifle).toMatchObject({ uid: AK });
    expect(card?.front.ct.knife.uid).toBe(KNIFE);
  });

  it('o que não está equipado mostra a arma padrão do jogo, sem uid nem raridade', () => {
    const [card] = buildHand(list(preset()), items);

    for (const side of ['ct', 't'] as const) {
      for (const slot of ['knife', 'gloves', 'rifle'] as const) {
        expect(card?.front[side][slot]).toMatchObject({ uid: null, rarity: null, statTrak: false });
      }
    }
    expect(card?.front.t.rifle.name).toMatch(/AK-47/);
  });

  describe('o rifle do CT', () => {
    it('é a M4A1-S quando ela está equipada', () => {
      const [card] = buildHand(
        list(preset({ highlights: [{ slot: 'weapon_m4a1_silencer', side: 'ct', uid: M4 }] })),
        items,
      );

      expect(card?.front.ct.rifle.uid).toBe(M4);
    });

    it('é a M4A4 padrão quando nenhuma das duas está', () => {
      const [card] = buildHand(list(preset()), items);

      expect(card?.front.ct.rifle.uid).toBeNull();
      expect(card?.front.ct.rifle.name).toMatch(/M4A4/);
    });
  });

  it('um destaque que não está mais no Inventário (corrida com a remoção) vira o padrão', () => {
    const [card] = buildHand(
      list(preset({ highlights: [{ slot: 'knife', side: 'ct', uid: GONE }] })),
      items,
    );

    expect(card?.front.ct.knife.uid).toBeNull();
  });

  it('o destaque de um lado não aparece no outro', () => {
    const [card] = buildHand(
      list(preset({ highlights: [{ slot: 'weapon_ak47', side: 't', uid: AK }] })),
      items,
    );

    expect(card?.front.ct.rifle.uid).toBeNull();
    expect(card?.front.t.rifle.uid).toBe(AK);
  });
});
