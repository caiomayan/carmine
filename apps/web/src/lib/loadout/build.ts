import type {
  InventoryItem,
  Loadout,
  LoadoutSide,
  LoadoutSlotGroup,
  ShowcaseItem,
} from '@carmine/contracts';
import type { Rarity } from '../catalog/types';
import { toCard } from '../inventory/cards';
import { slotDefault, slotOfItem } from './slots';
import { type CandidateView, type LoadoutView, type SlotViewGroup, slotKey } from './view';

/**
 * Monta o que as telas do Loadout mostram, a partir do contrato e do Inventário. **Só no
 * servidor** (usa o catálogo da cs2-lib).
 */

const VIEW_GROUP: Record<LoadoutSlotGroup, SlotViewGroup> = {
  knife: 'gear',
  gloves: 'gear',
  agent: 'gear',
  musicKit: 'gear',
  secondary: 'secondary',
  smg: 'smg',
  rifle: 'rifle',
  heavy: 'heavy',
  equipment: 'equipment',
};

export function buildLoadoutView(loadout: Loadout, items: InventoryItem[]): LoadoutView {
  const byUid = new Map(items.map((owned) => [owned.uid, owned]));
  return {
    presetId: loadout.presetId,
    presetName: loadout.presetName,
    readOnly: loadout.readOnly,
    slots: loadout.entries.map((entry) => {
      const fallback = slotDefault(entry.slot, entry.side);
      const owned = entry.uid ? byUid.get(entry.uid) : undefined;
      // Um uid sem Item no Inventário (corrida com uma remoção) aparece, nunca some.
      const card = owned ? toCard(owned) : null;
      return {
        key: slotKey(entry.slot, entry.side),
        slot: entry.slot,
        side: entry.side,
        group: VIEW_GROUP[entry.group],
        defaultName: fallback.name,
        defaultImage: fallback.image,
        item: entry.uid
          ? {
              uid: entry.uid,
              name: card?.name ?? 'Item',
              title: card?.title ?? 'Item',
              subtitle: card?.subtitle ?? null,
              image: card?.image ?? '',
              rarity: card?.rarity ?? 'consumer',
              statTrak: card?.statTrak ?? false,
            }
          : null,
        notInGame: entry.notInGame,
        strippedInGame: entry.strippedInGame,
      };
    }),
  };
}

/** O Inventário com o slot e os lados de cada Item, para escolher o que equipar. */
export function buildCandidates(items: InventoryItem[]): CandidateView[] {
  return items.map((owned) => {
    const where = slotOfItem(owned.item.id);
    return { ...toCard(owned), slot: where?.slot ?? null, sides: where?.sides ?? null };
  });
}

/** Um Item da vitrine do Perfil, com os lados em que está equipado (vazio no music kit). */
export type ShowcaseView = {
  key: string;
  name: string;
  title: string;
  subtitle: string | null;
  image: string;
  rarity: Rarity;
  statTrak: boolean;
  sides: LoadoutSide[];
};

/**
 * A vitrine do Loadout no Perfil: o mesmo Item no mesmo slot dos dois lados aparece uma vez só,
 * com "CT e TR"; a ordem é a dos slots que a API manda.
 */
export function buildShowcase(items: ShowcaseItem[]): ShowcaseView[] {
  const byKey = new Map<string, ShowcaseView>();
  for (const { slot, side, item } of items) {
    const key = `${slot}:${JSON.stringify(item)}`;
    const existing = byKey.get(key);
    if (existing) {
      if (side) existing.sides.push(side);
      continue;
    }
    const card = toCard({ uid: key, item, createdAt: '', updatedAt: '' });
    byKey.set(key, {
      key,
      name: card.name,
      title: card.title,
      subtitle: card.subtitle,
      image: card.image,
      rarity: card.rarity,
      statTrak: card.statTrak,
      sides: side ? [side] : [],
    });
  }
  return [...byKey.values()];
}
