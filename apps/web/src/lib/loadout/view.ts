import type {
  LoadoutSide,
  LoadoutSlot,
  NotInGameReason,
  VipStrippedAttribute,
} from '@carmine/contracts';
import type { Rarity } from '../catalog/types';
import type { InventoryCardData } from '../inventory/cards';

/**
 * O que as telas do Loadout recebem do servidor: o contrato com nome, imagem e raridade do
 * catálogo já resolvidos (a cs2-lib não vai para o navegador). Tipos sem dependência da lib.
 */

/** Grupos da tela: faca, luvas, agente e music kit ficam juntos no alto (`gear`). */
export const SLOT_VIEW_GROUPS = ['gear', 'secondary', 'smg', 'rifle', 'heavy', 'equipment'] as const;
export type SlotViewGroup = (typeof SLOT_VIEW_GROUPS)[number];

export type EquippedView = {
  uid: string;
  name: string;
  title: string;
  subtitle: string | null;
  image: string;
  rarity: Rarity;
  statTrak: boolean;
};

export type SlotView = {
  /** `slot:side`, único na tela. */
  key: string;
  slot: LoadoutSlot;
  side: LoadoutSide | null;
  group: SlotViewGroup;
  /** Nome da Arma padrão (ou "Faca", "Luvas"...); nulo no agente padrão, que depende do mapa. */
  defaultName: string | null;
  defaultImage: string | null;
  item: EquippedView | null;
  notInGame: NotInGameReason | null;
  strippedInGame: VipStrippedAttribute[];
};

/** Um Item do Inventário com o slot e os lados em que pode ser equipado. */
export type CandidateView = InventoryCardData & {
  slot: LoadoutSlot | null;
  sides: LoadoutSide[] | null;
};

export type LoadoutView = {
  presetId: string;
  presetName: string;
  readOnly: boolean;
  slots: SlotView[];
};

export const slotKey = (slot: LoadoutSlot, side: LoadoutSide | null) => `${slot}:${side ?? 'all'}`;

/** Onde cada Item está equipado: `uid` -> lados (vazio no music kit, que vale nos dois). */
export function equippedSides(slots: SlotView[]): Map<string, (LoadoutSide | null)[]> {
  const sides = new Map<string, (LoadoutSide | null)[]>();
  for (const slot of slots) {
    if (!slot.item) continue;
    sides.set(slot.item.uid, [...(sides.get(slot.item.uid) ?? []), slot.side]);
  }
  return sides;
}
