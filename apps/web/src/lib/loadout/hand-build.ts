import type {
  InventoryItem,
  LoadoutAssignment,
  LoadoutSide,
  LoadoutSlot,
  PresetList,
} from '@carmine/contracts';
import { toCard } from '../inventory/cards';
import type { HandCard, HandFront, HandPiece } from './hand-view';
import { slotDefault } from './slots';

/**
 * Monta as cartas da mão de Presets a partir da lista de Presets (com os destaques de cada um) e
 * do Inventário. **Só no servidor** (usa o catálogo da cs2-lib).
 */

/** O rifle de cada lado, na ordem de preferência: no CT, a M4A1-S se equipada, senão a M4A4. */
const RIFLE_SLOTS: Record<LoadoutSide, readonly LoadoutSlot[]> = {
  t: ['weapon_ak47'],
  ct: ['weapon_m4a1_silencer', 'weapon_m4a1'],
};

function piece(
  slot: LoadoutSlot,
  side: LoadoutSide,
  highlights: readonly LoadoutAssignment[],
  byUid: ReadonlyMap<string, InventoryItem>,
): HandPiece | null {
  const equipped = highlights.find((h) => h.slot === slot && h.side === side && h.uid !== null);
  const owned = equipped?.uid ? byUid.get(equipped.uid) : undefined;
  if (owned) {
    const card = toCard(owned);
    return {
      uid: owned.uid,
      name: card.name,
      image: card.image,
      rarity: card.rarity,
      statTrak: card.statTrak,
    };
  }
  return null;
}

function defaultPiece(slot: LoadoutSlot, side: LoadoutSide): HandPiece {
  const fallback = slotDefault(slot, side);
  return {
    uid: null,
    name: fallback.name ?? '',
    image: fallback.image ?? '',
    rarity: null,
    statTrak: false,
  };
}

function frontOf(
  side: LoadoutSide,
  highlights: readonly LoadoutAssignment[],
  byUid: ReadonlyMap<string, InventoryItem>,
): HandFront {
  const rifleSlot =
    RIFLE_SLOTS[side].find((slot) => piece(slot, side, highlights, byUid) !== null) ??
    (RIFLE_SLOTS[side].at(-1) as LoadoutSlot);
  const at = (slot: LoadoutSlot) =>
    piece(slot, side, highlights, byUid) ?? defaultPiece(slot, side);
  return { knife: at('knife'), gloves: at('gloves'), rifle: at(rifleSlot) };
}

export function buildHand(list: PresetList, items: readonly InventoryItem[]): HandCard[] {
  const byUid = new Map(items.map((owned) => [owned.uid, owned]));
  return list.presets.map((preset) => ({
    id: preset.id,
    name: preset.name,
    main: preset.main,
    active: preset.active,
    readOnly: preset.readOnly,
    equippedCount: preset.equippedCount,
    front: {
      ct: frontOf('ct', preset.highlights, byUid),
      t: frontOf('t', preset.highlights, byUid),
    },
  }));
}
