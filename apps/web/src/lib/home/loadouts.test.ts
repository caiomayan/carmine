import type { ShowcaseItem } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import type { Rarity } from '@/lib/catalog/types';
import {
  hasLoadoutCandidates,
  type ItemLookup,
  LOADOUT_CANDIDATES,
  pickHighlight,
  sidesOf,
} from './loadouts';

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

describe('hasLoadoutCandidates', () => {
  const entry = (publicId: number | null, isPrivate = false) => ({
    player: { private: isPrivate, publicId },
  });

  it('sem Ranking (nulo ou vazio) não há sinal de conteúdo', () => {
    expect(hasLoadoutCandidates([null, null])).toBe(false);
    expect(hasLoadoutCandidates([{ entries: [] }, { entries: [] }])).toBe(false);
  });

  it('só Perfil privado não conta: a vitrine só mostra Perfil público', () => {
    expect(hasLoadoutCandidates([{ entries: [entry(null, true), entry(null, true)] }])).toBe(false);
    expect(hasLoadoutCandidates([{ entries: [entry(7, true)] }])).toBe(false);
  });

  it('um Perfil público em qualquer dos Modos basta', () => {
    expect(
      hasLoadoutCandidates([{ entries: [] }, { entries: [entry(null, true), entry(12)] }]),
    ).toBe(true);
  });

  it('só olha os primeiros 8 de cada Modo, como a busca da vitrine', () => {
    const privates = Array.from({ length: LOADOUT_CANDIDATES }, () => entry(null, true));
    expect(hasLoadoutCandidates([{ entries: [...privates, entry(99)] }])).toBe(false);
    expect(hasLoadoutCandidates([{ entries: [...privates.slice(1), entry(99)] }])).toBe(true);
  });
});
