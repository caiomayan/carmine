import {
  HEADER_LATEST_ITEMS,
  HEADER_TOP_SIZE,
  type HeaderInventory,
  type HeaderLoadout,
  type HeaderLoadoutSlot,
  type HeaderRankingMode,
  INVENTORY_MAX_ITEMS,
  type InventoryItem,
  type Loadout,
  type LoadoutSide,
  type Ranking,
} from '@carmine/contracts';

/** O rifle de cada lado: no TR, a AK-47; no CT, a M4A1-S se estiver equipada, senão a M4A4. */
const RIFLE_SLOTS: Record<LoadoutSide, readonly string[]> = {
  t: ['weapon_ak47'],
  ct: ['weapon_m4a1_silencer', 'weapon_m4a1'],
};

/**
 * O retrato do Loadout no painel do header: faca, luvas, o rifle do lado e a AWP. Slot sem Item
 * equipado vem com `itemId` e `uid` nulos (arma padrão).
 */
export function loadoutPreview(
  loadout: Loadout,
  items: ReadonlyMap<string, InventoryItem>,
  side: LoadoutSide,
): HeaderLoadout {
  const entryOf = (slot: string) =>
    loadout.entries.find((entry) => entry.slot === slot && entry.side === side);
  const slotOf = (slot: string): HeaderLoadoutSlot => {
    const uid = entryOf(slot)?.uid ?? null;
    const item = uid === null ? undefined : items.get(uid)?.item;
    return item
      ? { slot, itemId: item.id, uid, statTrak: item.statTrak !== undefined }
      : { slot, itemId: null, uid: null, statTrak: false };
  };
  const rifles = RIFLE_SLOTS[side].map(slotOf);
  const rifle =
    rifles.find((candidate) => candidate.uid !== null) ?? (rifles.at(-1) as HeaderLoadoutSlot);
  return {
    side,
    presetId: loadout.presetId,
    presetName: loadout.presetName,
    slots: [slotOf('knife'), slotOf('gloves'), rifle, slotOf('weapon_awp')],
  };
}

/** O painel do Inventário: o total e os {@link HEADER_LATEST_ITEMS} mais novos (a lista já vem do mais novo). */
export function inventoryPreview(items: readonly InventoryItem[]): HeaderInventory {
  return {
    total: items.length,
    limit: INVENTORY_MAX_ITEMS,
    latest: items.slice(0, HEADER_LATEST_ITEMS).map((entry) => ({
      uid: entry.uid,
      itemId: entry.item.id,
      statTrak: entry.item.statTrak !== undefined,
      createdAt: entry.createdAt,
    })),
  };
}

/**
 * Um Modo no painel do Ranking: as {@link HEADER_TOP_SIZE} primeiras linhas e, para quem tem
 * sessão, a própria posição (ou quanto falta para o mínimo). O Ranking só traz `viewer` com sessão.
 */
export function rankingModePreview(ranking: Ranking): HeaderRankingMode {
  return {
    mode: ranking.mode,
    top: ranking.entries.slice(0, HEADER_TOP_SIZE),
    mine: ranking.viewer
      ? {
          position: ranking.viewer.entry?.position ?? null,
          progress: ranking.viewer.progress,
        }
      : null,
  };
}
