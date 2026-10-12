import type { ItemUsages, LoadoutSide } from '@carmine/contracts';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { loadoutSlots, presets } from '../database/schema.js';

type Db = Pick<Database, 'select'>;

/**
 * Onde o Item está equipado: `loadout`, os slots do Preset ativo; `presets`, os outros Presets
 * que o usam, com os slots de cada um. Não olha se o Item foi removido: quem chama já sabe.
 */
export async function itemUsagesOf(db: Db, itemId: string): Promise<ItemUsages> {
  const rows = await db
    .select({
      presetId: presets.id,
      name: presets.name,
      active: presets.active,
      slot: loadoutSlots.slot,
      side: loadoutSlots.side,
    })
    .from(loadoutSlots)
    .innerJoin(presets, eq(presets.id, loadoutSlots.presetId))
    .where(eq(loadoutSlots.itemId, itemId))
    .orderBy(
      asc(presets.createdAt),
      asc(presets.id),
      asc(loadoutSlots.slot),
      asc(loadoutSlots.side),
    );
  const usages: ItemUsages = { loadout: [], presets: [] };
  for (const { presetId, name, active, slot, side: dbSide } of rows) {
    const side: LoadoutSide | null = dbSide === 'any' ? null : dbSide;
    if (active) {
      usages.loadout.push({ slot, side });
      continue;
    }
    let preset = usages.presets.find(({ id }) => id === presetId);
    if (!preset) {
      preset = { id: presetId, name, slots: [] };
      usages.presets.push(preset);
    }
    preset.slots.push({ slot, side });
  }
  return usages;
}
