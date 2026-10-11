import { createHash } from 'node:crypto';
import { type Cs2Item, type EquippedV5, inGameOf, type LoadoutSide } from '@carmine/contracts';
import {
  CS2_MIN_KEYCHAIN_SEED,
  CS2_MIN_SEED,
  CS2_MIN_STICKER_WEAR,
  CS2_MIN_WEAR,
  type CS2EconomyItem,
} from '@ianlucas/cs2-lib';
import type { Catalog } from '../catalog/catalog.js';

/** Um Item equipado num slot e lado do Preset ativo, com o `uid` numérico do plugin. */
export interface EquippedItem {
  slot: string;
  /** Nulo no music kit. */
  side: LoadoutSide | null;
  item: Cs2Item;
  econUid: number;
}

/** Time no `equipped/v5` (o `CS2Team` da cs2-lib): 2 = TR, 3 = CT. */
const TEAM: Record<LoadoutSide, number> = { t: 2, ct: 3 };

type Weapon = NonNullable<EquippedV5['ctWeapons']>[string];
type Melee = NonNullable<EquippedV5['knives']>[string];
type Gloves = NonNullable<EquippedV5['gloves']>[string];
type Agent = NonNullable<EquippedV5['agents']>[string];

/**
 * O `hash` que o plugin compara para saber se o Item mudou (no cs2-inventory-simulator, 7
 * caracteres do hash do objeto). Os campos já vêm numa ordem fixa, então o JSON é estável.
 */
function withHash<T extends object>(econ: T): T & { hash: string } {
  const hash = createHash('sha1').update(JSON.stringify(econ)).digest('hex').slice(0, 7);
  return { ...econ, hash };
}

/**
 * Converte o Loadout para o formato `equipped/v5` do cs2-css-inventory-simulator (ADR 0006), o
 * mesmo do `generate` do cs2-inventory-simulator (`app/shared/inventory-equipped-v5.ts`, MIT, ©
 * Ian Lucas). Aplica o filtro VIP ({@link inGameOf}): sem Período VIP ativo, agentes e music kits
 * ficam fora e o StatTrak e a nametag saem do Item.
 */
export function toEquippedV5(
  items: readonly EquippedItem[],
  catalog: Catalog,
  account: { vip: boolean },
): EquippedV5 {
  const agents: Record<string, Agent> = {};
  const ctWeapons: Record<string, Weapon> = {};
  const gloves: Record<string, Gloves> = {};
  const knives: Record<string, Melee> = {};
  const tWeapons: Record<string, Weapon> = {};
  let musicKit: EquippedV5['musicKit'];

  for (const { side, item: stored, econUid } of items) {
    const data = catalog.find(stored.id);
    if (!data) continue;
    const { notInGame, strippedInGame } = inGameOf(data.type, stored, account);
    if (notInGame !== null) continue;
    const item = {
      ...stored,
      ...(strippedInGame.includes('statTrak') && { statTrak: undefined }),
      ...(strippedInGame.includes('nameTag') && { nameTag: undefined }),
    };
    const team = side === null ? undefined : TEAM[side];
    switch (data.type) {
      case 'weapon': {
        if (team === undefined || data.definitionIndex === undefined) break;
        const weapons = side === 'ct' ? ctWeapons : tWeapons;
        weapons[data.definitionIndex] = weaponOf(item, data, econUid, catalog);
        break;
      }
      case 'melee':
        if (team === undefined || data.definitionIndex === undefined) break;
        knives[team] = withHash({
          def: data.definitionIndex,
          nametag: item.nameTag ?? '',
          paint: data.variantIndex ?? 0,
          seed: item.seed ?? CS2_MIN_SEED,
          stattrak: item.statTrak ?? -1,
          stickers: [],
          uid: econUid,
          wear: wearOf(item, data),
        });
        break;
      case 'glove':
        if (team === undefined || data.definitionIndex === undefined) break;
        gloves[team] = withHash({
          def: data.definitionIndex,
          paint: data.variantIndex ?? 0,
          seed: item.seed ?? CS2_MIN_SEED,
          wear: wearOf(item, data),
        });
        break;
      case 'agent':
        if (team === undefined || data.definitionIndex === undefined) break;
        // Patches de agente não são simulados: a lista vai sempre vazia.
        agents[team] = withHash({ def: data.definitionIndex, stickers: [] });
        break;
      case 'musickit':
        if (data.variantIndex === undefined) break;
        musicKit = { musicId: data.variantIndex, stattrak: item.statTrak ?? -1, uid: econUid };
        break;
    }
  }

  return {
    agents,
    ctWeapons,
    gloves,
    knives,
    ...(musicKit && { musicKit }),
    tWeapons,
  };
}

/** O float do Item; sem float salvo, o mínimo da skin (o `getWear` da cs2-lib). */
function wearOf(item: Cs2Item, data: CS2EconomyItem): number {
  return item.wear ?? data.wearMin ?? CS2_MIN_WEAR;
}

function weaponOf(item: Cs2Item, data: CS2EconomyItem, econUid: number, catalog: Catalog): Weapon {
  return withHash({
    def: data.definitionIndex ?? 0,
    nametag: item.nameTag ?? '',
    paint: data.variantIndex ?? 0,
    seed: item.seed ?? CS2_MIN_SEED,
    stattrak: item.statTrak ?? -1,
    stickers: Object.entries(item.stickers ?? {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([slot, sticker]) => ({
        def: catalog.find(sticker.id)?.variantIndex ?? 0,
        rotation: sticker.rotation,
        schema: sticker.schema,
        slot: Number(slot),
        wear: sticker.wear ?? CS2_MIN_STICKER_WEAR,
        x: sticker.x,
        y: sticker.y,
      }))
      .map(dropUndefined),
    keychains: Object.entries(item.keychains ?? {})
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([slot, keychain]) => {
        const charm = catalog.find(keychain.id);
        return dropUndefined({
          def: charm?.variantIndex ?? 0,
          seed: keychain.seed ?? CS2_MIN_KEYCHAIN_SEED,
          slot: Number(slot),
          sticker: charm?.displayedSticker?.variantIndex,
          x: keychain.x,
          y: keychain.y,
          z: keychain.z,
        });
      }),
    uid: econUid,
    wear: wearOf(item, data),
  });
}

/** Campos ausentes saem do objeto (o JSON e o hash ficam iguais aos do cs2-inventory-simulator). */
function dropUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}
