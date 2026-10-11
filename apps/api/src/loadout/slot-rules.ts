import { type Cs2Item, inGameOf, type LoadoutEntry, type LoadoutSide } from '@carmine/contracts';
import type { SlotDefinition } from '../catalog/catalog.js';

/** Chave de um slot de um lado, ex.: `weapon_ak47:t`, `musicKit:null`. */
export const slotKey = (slot: string, side: LoadoutSide | null) => `${slot}:${side}`;

/**
 * Os lados em que equipar: os pedidos (sem repetir) ou, sem pedido, todos os do Item. No music
 * kit, que não tem lado, sempre `[null]`. Um lado em que o Item não existe é recusado com o
 * caminho dele (`sides.<i>`).
 */
export function sidesToApply(
  itemSides: readonly LoadoutSide[] | null,
  requested: readonly LoadoutSide[] | undefined,
): { sides: (LoadoutSide | null)[] } | { field: string } {
  if (itemSides === null) return { sides: [null] };
  if (requested === undefined) return { sides: [...itemSides] };
  const index = requested.findIndex((side) => !itemSides.includes(side));
  if (index !== -1) return { field: `sides.${index}` };
  return { sides: [...new Set(requested)] };
}

/** Um Item num slot, com o tipo do catálogo (`CS2ItemType`). */
export interface AssignedItem {
  uid: string;
  type: string;
  item: Cs2Item;
}

/** Todos os slots, na ordem do catálogo, com o Item de cada um e o que dele vai para o jogo. */
export function entriesOf(
  slots: readonly SlotDefinition[],
  assigned: ReadonlyMap<string, AssignedItem>,
  account: { vip: boolean },
): LoadoutEntry[] {
  return slots.map(({ slot, side, group, def }) => {
    const equipped = assigned.get(slotKey(slot, side));
    const inGame = equipped
      ? inGameOf(equipped.type, equipped.item, account)
      : { notInGame: null, strippedInGame: [] };
    return { slot, side, group, def, uid: equipped?.uid ?? null, ...inGame };
  });
}
