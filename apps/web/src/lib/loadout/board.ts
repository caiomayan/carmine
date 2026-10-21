import type { LoadoutSide } from '@carmine/contracts';
import { equippedTeamSides } from '../team-sides';
import type { SlotView, SlotViewGroup } from './view';

/**
 * O quadro do Loadout, no desenho do menu de compra do CS2: uma coluna por categoria, com todas
 * as armas dela, e o resto do equipamento (faca, luvas, agente e kit de música) fechando a
 * última. Lógica pura, sem React nem catálogo: o que a tela mostra, em que ordem e como o teclado
 * anda por ela.
 */

export const BOARD_COLUMNS = ['secondary', 'smg', 'rifle', 'heavy', 'equipment'] as const;
export type BoardColumnId = (typeof BOARD_COLUMNS)[number];

export type BoardColumn = {
  id: BoardColumnId;
  slots: SlotView[];
  /** Quantos dos slots da coluna têm Item. */
  equipped: number;
};

/** A ordem do menu de compra do CS2 em cada categoria (a da API é a do `definitionIndex`). */
export const MENU_ORDER = [
  // Pistolas
  'weapon_glock',
  'weapon_hkp2000',
  'weapon_usp_silencer',
  'weapon_elite',
  'weapon_p250',
  'weapon_tec9',
  'weapon_fiveseven',
  'weapon_cz75a',
  'weapon_deagle',
  'weapon_revolver',
  // Submetralhadoras
  'weapon_mac10',
  'weapon_mp9',
  'weapon_mp7',
  'weapon_mp5sd',
  'weapon_ump45',
  'weapon_bizon',
  'weapon_p90',
  // Rifles
  'weapon_galilar',
  'weapon_famas',
  'weapon_ak47',
  'weapon_m4a1',
  'weapon_m4a1_silencer',
  'weapon_ssg08',
  'weapon_sg556',
  'weapon_aug',
  'weapon_awp',
  'weapon_g3sg1',
  'weapon_scar20',
  // Pesadas
  'weapon_nova',
  'weapon_xm1014',
  'weapon_mag7',
  'weapon_sawedoff',
  'weapon_m249',
  'weapon_negev',
  // Equipamento
  'weapon_taser',
  // Depois das armas: faca, luvas, agente e kit de música
  'knife',
  'gloves',
  'agent',
  'musicKit',
] as const;

const menuIndex = (slot: string) => {
  const index = (MENU_ORDER as readonly string[]).indexOf(slot);
  return index === -1 ? MENU_ORDER.length : index;
};

/** Faca, luvas, agente e kit de música moram na última coluna, junto com o Zeus. */
const COLUMN_OF: Record<SlotViewGroup, BoardColumnId> = {
  secondary: 'secondary',
  smg: 'smg',
  rifle: 'rifle',
  heavy: 'heavy',
  equipment: 'equipment',
  gear: 'equipment',
};

/** As colunas do quadro para o lado visto: só os slots que existem nele, na ordem do menu. */
export function buildBoard(slots: SlotView[], side: LoadoutSide): BoardColumn[] {
  const visible = slots.filter((slot) => slot.side === side || slot.side === null);
  return BOARD_COLUMNS.map((id) => {
    const inColumn = visible
      .filter((slot) => COLUMN_OF[slot.group] === id)
      // `sort` é estável: o que o menu não conhece fica no fim, na ordem em que a API mandou.
      .sort((a, b) => menuIndex(a.slot) - menuIndex(b.slot));
    return { id, slots: inColumn, equipped: inColumn.filter((slot) => slot.item).length };
  });
}

/**
 * Os lados em que o Item do slot está equipado (o mesmo Item no mesmo slot), na ordem fixa TR e
 * CT. O kit de música não tem lado: vale nos dois.
 */
export function equippedSidesOf(slots: SlotView[], slot: SlotView): LoadoutSide[] {
  const uid = slot.item?.uid;
  if (!uid) return [];
  return equippedTeamSides(
    slot.side === null
      ? [null]
      : slots
          .filter((other) => other.slot === slot.slot && other.item?.uid === uid)
          .map((other) => other.side),
  );
}

/** Onde a seleção começa: o primeiro slot com Item, ou o primeiro cartão do quadro. */
export function defaultSelection(columns: BoardColumn[]): string | null {
  const all = columns.flatMap((column) => column.slots);
  return (all.find((slot) => slot.item) ?? all[0])?.key ?? null;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Para onde a seta leva: cima e baixo andam pela coluna; esquerda e direita vão para a coluna
 * vizinha que tem cartões, na mesma linha (ou na última, se a outra é menor). Nas pontas, fica.
 */
export function moveInBoard(columns: BoardColumn[], key: string, direction: Direction): string {
  const filled = columns.filter((column) => column.slots.length > 0);
  const columnIndex = filled.findIndex((column) => column.slots.some((slot) => slot.key === key));
  const column = filled[columnIndex];
  if (!column) return key;
  const row = column.slots.findIndex((slot) => slot.key === key);
  if (direction === 'up' || direction === 'down') {
    return column.slots[row + (direction === 'down' ? 1 : -1)]?.key ?? key;
  }
  const next = filled[columnIndex + (direction === 'right' ? 1 : -1)];
  if (!next) return key;
  return next.slots[Math.min(row, next.slots.length - 1)]?.key ?? key;
}

/** O primeiro cartão da coluna `number` (1 a 5, como no CS2), se ela existe e tem cartões. */
export function columnStartKey(columns: BoardColumn[], number: number): string | null {
  return columns[number - 1]?.slots[0]?.key ?? null;
}

/** O nome do slot de uma chave `slot:lado`, em qualquer lado; nulo se a chave não é de um slot. */
export function slotNameOfKey(slots: SlotView[], key: string | null): string | null {
  return slots.find((slot) => slot.key === key)?.slot ?? null;
}

/** O outro lado, quando o slot também existe nele (a AWP existe nos dois; a AK, só no TR). */
export function otherSideOf(slots: SlotView[], slot: SlotView): LoadoutSide | null {
  if (!slot.side) return null;
  const other: LoadoutSide = slot.side === 'ct' ? 't' : 'ct';
  return slots.some((candidate) => candidate.slot === slot.slot && candidate.side === other)
    ? other
    : null;
}
