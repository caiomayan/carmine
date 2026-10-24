import type { ShowcaseItem } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import type { Rarity } from '@/lib/catalog/types';
import { type ItemLookup, pickHighlight, sidesOf } from './loadouts';

const item = (id: number, slot: string, side: 'ct' | 't' | null = 'ct'): ShowcaseItem =>
  ({ slot, side, item: { id } }) as ShowcaseItem;

const catalog: Record<number, { rarity: Rarity; type: string }> = {
  1: { rarity: 'milspec', type: 'weapon' },
  2: { rarity: 'covert', type: 'weapon' },
  3: { rarity: 'covert', type: 'knife' },
  4: { rarity: 'contraband', type: 'agent' },
  5: { rarity: 'classified', type: 'glove' },
};
const lookup: ItemLookup = (id) => catalog[id] ?? null;

describe('pickHighlight', () => {
  it('escolhe o Item mais raro da vitrine', () => {
    const items = [item(1, 'weapon_ak47'), item(5, 'gloves'), item(2, 'weapon_awp')];
    expect(pickHighlight(items, lookup)?.item.id).toBe(2);
  });

  it('no empate de raridade, a faca ou as luvas ganham da arma', () => {
    const items = [item(2, 'weapon_awp'), item(3, 'knife')];
    expect(pickHighlight(items, lookup)?.item.id).toBe(3);
  });

  it('agente e music kit não entram, mesmo sendo os mais raros', () => {
    expect(pickHighlight([item(4, 'agent'), item(1, 'weapon_ak47')], lookup)?.item.id).toBe(1);
    expect(pickHighlight([item(4, 'agent')], lookup)).toBeNull();
  });

  it('Item que o catálogo não conhece é ignorado; vitrine vazia não tem destaque', () => {
    expect(pickHighlight([item(999, 'weapon_ak47')], lookup)).toBeNull();
    expect(pickHighlight([], lookup)).toBeNull();
  });
});

describe('sidesOf', () => {
  it('o lado do slot', () => {
    expect(sidesOf(item(2, 'weapon_awp', 't'), [item(2, 'weapon_awp', 't')])).toEqual(['t']);
  });

  it('a mesma skin nos dois lados da vitrine vale para os dois, em ordem fixa', () => {
    const awpT = item(2, 'weapon_awp', 't');
    const awpCt = item(2, 'weapon_awp', 'ct');
    expect(sidesOf(awpT, [awpT, awpCt])).toEqual(['ct', 't']);
  });

  it('slot sem lado vale para os dois', () => {
    const glove = item(5, 'gloves', null);
    expect(sidesOf(glove, [glove])).toEqual(['ct', 't']);
  });
});
