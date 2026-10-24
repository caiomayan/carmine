import { describe, expect, it } from 'vitest';
import {
  BOARD_COLUMNS,
  buildBoard,
  columnStartKey,
  defaultSelection,
  equippedSidesOf,
  MENU_ORDER,
  moveInBoard,
  otherSideOf,
  slotNameOfKey,
} from './board';
import type { SlotView, SlotViewGroup } from './view';

const slot = (
  name: string,
  side: SlotView['side'],
  group: SlotViewGroup,
  uid: string | null = null,
): SlotView => ({
  key: `${name}:${side ?? 'all'}`,
  slot: name,
  side,
  group,
  defaultName: name,
  defaultImage: null,
  item: uid
    ? {
        uid,
        name: uid,
        title: uid,
        subtitle: null,
        image: '',
        palette: null,
        rarity: 'milspec',
        statTrak: false,
      }
    : null,
  notInGame: null,
  strippedInGame: [],
});

// Na ordem em que a API manda (por definitionIndex), que não é a do menu do CS2.
const slots: SlotView[] = [
  slot('knife', 'ct', 'gear'),
  slot('knife', 't', 'gear'),
  slot('agent', 'ct', 'gear'),
  slot('agent', 't', 'gear'),
  slot('musicKit', null, 'gear'),
  slot('weapon_deagle', 'ct', 'secondary'),
  slot('weapon_deagle', 't', 'secondary'),
  slot('weapon_glock', 't', 'secondary'),
  slot('weapon_hkp2000', 'ct', 'secondary'),
  slot('weapon_p250', 'ct', 'secondary', 'p250-uid'),
  slot('weapon_p250', 't', 'secondary', 'p250-uid'),
  slot('weapon_mp9', 'ct', 'smg'),
  slot('weapon_mac10', 't', 'smg'),
  slot('weapon_ak47', 't', 'rifle'),
  slot('weapon_m4a1', 'ct', 'rifle'),
  slot('weapon_awp', 'ct', 'rifle'),
  slot('weapon_awp', 't', 'rifle'),
  slot('weapon_nova', 'ct', 'heavy'),
  slot('weapon_nova', 't', 'heavy'),
  slot('weapon_taser', 'ct', 'equipment'),
  slot('weapon_taser', 't', 'equipment'),
  slot('gloves', 'ct', 'gear'),
  slot('gloves', 't', 'gear'),
];

const names = (column: { slots: SlotView[] }) => column.slots.map((s) => s.slot);

describe('quadro do Loadout', () => {
  it('tem as cinco colunas do menu de compra, na ordem', () => {
    expect(buildBoard(slots, 'ct').map((column) => column.id)).toEqual([...BOARD_COLUMNS]);
    expect(BOARD_COLUMNS).toEqual(['secondary', 'smg', 'rifle', 'heavy', 'equipment']);
  });

  it('cada coluna mostra as armas do lado, na ordem do menu e não na da API', () => {
    const [secondary, smg, rifle] = buildBoard(slots, 'ct');
    expect(names(secondary as never)).toEqual(['weapon_hkp2000', 'weapon_p250', 'weapon_deagle']);
    expect(names(smg as never)).toEqual(['weapon_mp9']);
    expect(names(rifle as never)).toEqual(['weapon_m4a1', 'weapon_awp']);
  });

  it('uma arma de um lado só não aparece no outro', () => {
    const [secondary, smg, rifle] = buildBoard(slots, 't');
    expect(names(secondary as never)).toEqual(['weapon_glock', 'weapon_p250', 'weapon_deagle']);
    expect(names(smg as never)).toEqual(['weapon_mac10']);
    expect(names(rifle as never)).toEqual(['weapon_ak47', 'weapon_awp']);
  });

  it('o Equipamento fecha com o Zeus, a faca, as luvas, o agente e o kit de música', () => {
    const equipment = buildBoard(slots, 'ct')[4];
    expect(names(equipment as never)).toEqual([
      'weapon_taser',
      'knife',
      'gloves',
      'agent',
      'musicKit',
    ]);
  });

  it('o kit de música (sem lado) aparece nos dois lados', () => {
    for (const side of ['ct', 't'] as const) {
      expect(names(buildBoard(slots, side)[4] as never)).toContain('musicKit');
    }
  });

  it('uma arma que o menu não conhece vai para o fim da coluna, na ordem da API', () => {
    const extra = [
      ...slots,
      slot('weapon_novidade', 'ct', 'secondary'),
      slot('weapon_outra', 'ct', 'secondary'),
    ];
    expect(names(buildBoard(extra, 'ct')[0] as never)).toEqual([
      'weapon_hkp2000',
      'weapon_p250',
      'weapon_deagle',
      'weapon_novidade',
      'weapon_outra',
    ]);
  });

  it('conta quantos slots da coluna têm Item', () => {
    const [secondary, smg] = buildBoard(slots, 'ct');
    expect(secondary).toMatchObject({ equipped: 1 });
    expect(secondary?.slots).toHaveLength(3);
    expect(smg).toMatchObject({ equipped: 0 });
  });

  it('sem slots, as colunas existem vazias', () => {
    expect(buildBoard([], 'ct').map((column) => column.slots.length)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('lados em que o Item do slot está equipado', () => {
  it('o mesmo Item nos dois lados dá os dois, na ordem TR e CT', () => {
    const p250 = slots.find((s) => s.key === 'weapon_p250:ct') as SlotView;
    expect(equippedSidesOf(slots, p250)).toEqual(['t', 'ct']);
  });

  it('um Item diferente do outro lado não conta', () => {
    const all = [slot('knife', 'ct', 'gear', 'a'), slot('knife', 't', 'gear', 'b')];
    expect(equippedSidesOf(all, all[0] as SlotView)).toEqual(['ct']);
    expect(equippedSidesOf(all, all[1] as SlotView)).toEqual(['t']);
  });

  it('vazio não tem lado; o kit de música equipado vale nos dois', () => {
    expect(equippedSidesOf(slots, slots[0] as SlotView)).toEqual([]);
    const kit = slot('musicKit', null, 'gear', 'kit');
    expect(equippedSidesOf([kit], kit)).toEqual(['t', 'ct']);
  });
});

describe('seleção e navegação pelo teclado', () => {
  const ct = buildBoard(slots, 'ct');

  it('começa no primeiro slot com Item; sem nenhum, no primeiro cartão', () => {
    expect(defaultSelection(ct)).toBe('weapon_p250:ct');
    expect(defaultSelection(buildBoard([], 'ct'))).toBeNull();
    const empty = buildBoard(
      slots.map((s) => ({ ...s, item: null })),
      'ct',
    );
    expect(defaultSelection(empty)).toBe('weapon_hkp2000:ct');
  });

  it('as setas para cima e para baixo andam pela coluna e param nas pontas', () => {
    expect(moveInBoard(ct, 'weapon_hkp2000:ct', 'down')).toBe('weapon_p250:ct');
    expect(moveInBoard(ct, 'weapon_p250:ct', 'up')).toBe('weapon_hkp2000:ct');
    expect(moveInBoard(ct, 'weapon_hkp2000:ct', 'up')).toBe('weapon_hkp2000:ct');
    expect(moveInBoard(ct, 'weapon_deagle:ct', 'down')).toBe('weapon_deagle:ct');
  });

  it('as setas para os lados mantêm a linha, até a última da outra coluna', () => {
    expect(moveInBoard(ct, 'weapon_p250:ct', 'right')).toBe('weapon_mp9:ct');
    expect(moveInBoard(ct, 'weapon_deagle:ct', 'right')).toBe('weapon_mp9:ct');
    expect(moveInBoard(ct, 'weapon_mp9:ct', 'left')).toBe('weapon_hkp2000:ct');
    expect(moveInBoard(ct, 'weapon_hkp2000:ct', 'left')).toBe('weapon_hkp2000:ct');
  });

  it('pula colunas vazias', () => {
    const noSmg = buildBoard(
      slots.filter((s) => s.group !== 'smg'),
      'ct',
    );
    expect(moveInBoard(noSmg, 'weapon_hkp2000:ct', 'right')).toBe('weapon_m4a1:ct');
  });

  it('um slot que não está no quadro fica onde está', () => {
    expect(moveInBoard(ct, 'weapon_glock:t', 'down')).toBe('weapon_glock:t');
  });

  it('os números 1 a 5 levam ao primeiro cartão da coluna', () => {
    expect(columnStartKey(ct, 1)).toBe('weapon_hkp2000:ct');
    expect(columnStartKey(ct, 3)).toBe('weapon_m4a1:ct');
    expect(columnStartKey(ct, 5)).toBe('weapon_taser:ct');
    expect(columnStartKey(ct, 6)).toBeNull();
    expect(columnStartKey(buildBoard([], 'ct'), 1)).toBeNull();
  });
});

describe('menu do CS2 contra o catálogo', () => {
  it('conhece toda arma com skin que o Loadout oferece, e nenhuma a mais', async () => {
    const { economy } = await import('../catalog/catalog');
    const all = economy().itemsAsArray;
    const skinned = new Set(
      all.filter((item) => item.type === 'weapon' && !item.isDefault).map((item) => item.modelKey),
    );
    const groups = new Set<string>(BOARD_COLUMNS);
    const offered = all
      .filter(
        (item) =>
          item.type === 'weapon' &&
          item.isDefault &&
          skinned.has(item.modelKey) &&
          groups.has(item.loadoutCategory ?? ''),
      )
      .map((item) => `weapon_${item.modelKey}`);
    const known = MENU_ORDER.filter((name) => name.startsWith('weapon_'));
    expect([...offered].sort()).toEqual([...known].sort());
    // Carregar a economia da cs2-lib passa de 5 s com os outros testes disputando a CPU.
  }, 30_000);
});

describe('slot de uma chave e o outro lado', () => {
  it('acha o nome do slot pela chave, de qualquer lado', () => {
    expect(slotNameOfKey(slots, 'weapon_p250:t')).toBe('weapon_p250');
    expect(slotNameOfKey(slots, 'musicKit:all')).toBe('musicKit');
    expect(slotNameOfKey(slots, 'weapon_nao_existe:ct')).toBeNull();
    expect(slotNameOfKey(slots, null)).toBeNull();
  });

  it('o outro lado só existe quando o slot também está nele', () => {
    const find = (key: string) => slots.find((s) => s.key === key) as SlotView;
    expect(otherSideOf(slots, find('weapon_p250:ct'))).toBe('t');
    expect(otherSideOf(slots, find('weapon_p250:t'))).toBe('ct');
    expect(otherSideOf(slots, find('weapon_glock:t'))).toBeNull();
    expect(otherSideOf(slots, find('weapon_hkp2000:ct'))).toBeNull();
    expect(otherSideOf(slots, find('musicKit:all'))).toBeNull();
  });
});
