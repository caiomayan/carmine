import type { LoadoutSide, LoadoutSlot } from '@carmine/contracts';
import { loadoutSlotOf } from '@carmine/contracts/rules';
import { CS2Team } from '@ianlucas/cs2-lib';
import { catalogEntry, economy } from '../catalog/catalog';

/**
 * O Loadout visto pela cs2-lib (ADR 0006). **Só no servidor**, como o catálogo. A regra de
 * onde um Item vai é a do contrato (`loadoutSlotOf`), a mesma da API.
 */

/** Onde um Item do catálogo é equipado e em que lados; nulo se não é um Item. */
export function slotOfItem(
  catalogId: number,
): { slot: LoadoutSlot; sides: LoadoutSide[] | null } | null {
  if (!catalogEntry(catalogId)) return null;
  return loadoutSlotOf(economy().getById(catalogId));
}

const TEAM: Record<LoadoutSide, CS2Team> = { ct: CS2Team.CT, t: CS2Team.T };

export type SlotDefault = { name: string | null; image: string | null };

const defaults = new Map<string, SlotDefault>();

/**
 * O que o jogador usa num slot vazio: a Arma padrão (ou a faca, as luvas e o music kit padrão).
 * Não é um Item (CONTEXT.md): só empresta o nome e a imagem. O agente padrão depende do mapa,
 * então não tem nome nem imagem aqui.
 */
export function slotDefault(slot: LoadoutSlot, side: LoadoutSide | null): SlotDefault {
  const key = `${slot}:${side}`;
  const cached = defaults.get(key);
  if (cached) return cached;
  const team = side ? TEAM[side] : null;
  const item = economy().itemsAsArray.find((candidate) => {
    if (!candidate.isDefault) return false;
    if (slot === 'musicKit') return candidate.isMusicKit();
    if (team === null || !candidate.teams?.includes(team)) return false;
    if (slot === 'knife') return candidate.isMelee();
    if (slot === 'gloves') return candidate.isGloves();
    return candidate.isWeapon() && `weapon_${candidate.modelKey}` === slot;
  });
  const result: SlotDefault =
    slot === 'agent' || !item
      ? { name: null, image: null }
      : { name: item.name.replace(/\s+/g, ' ').trim(), image: item.getImageUrl() };
  defaults.set(key, result);
  return result;
}
