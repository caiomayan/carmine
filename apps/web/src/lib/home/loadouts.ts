import type { ShowcaseItem } from '@carmine/contracts';
import { RARITIES, type Rarity } from '@/lib/catalog/types';

/**
 * "Loadouts da semana": o que os melhores da semana (do Ranking) estão usando. De cada Perfil público sai UM
 * Item, o mais raro da vitrine do Loadout (facas e luvas à frente no empate), para a vitrine da Home girar por
 * pessoas diferentes. Parte pura: o catálogo (raridade e tipo de cada Item) entra por `lookup`.
 */
export type ItemLookup = (itemId: number) => { rarity: Rarity; type: string } | null;

const rank = (rarity: Rarity) => RARITIES.indexOf(rarity);

/** O Item em destaque da vitrine de uma pessoa, ou nulo se ela não tem nenhum que o catálogo conheça. */
export function pickHighlight(
  items: readonly ShowcaseItem[],
  lookup: ItemLookup,
): ShowcaseItem | null {
  let best: { item: ShowcaseItem; rarity: number; prized: boolean } | null = null;
  for (const item of items) {
    const entry = lookup(item.item.id);
    // Agente e music kit não são "arma": a vitrine da Home mostra skins.
    if (!entry || entry.type === 'agent' || entry.type === 'musickit') continue;
    const candidate = {
      item,
      rarity: rank(entry.rarity),
      prized: entry.type === 'knife' || entry.type === 'glove',
    };
    if (
      best === null ||
      candidate.rarity > best.rarity ||
      (candidate.rarity === best.rarity && candidate.prized && !best.prized)
    ) {
      best = candidate;
    }
  }
  return best?.item ?? null;
}

/**
 * Os lados em que o Item do Loadout vale: o lado do slot, ou os dois quando o slot não tem lado (music kit,
 * que a Home nem mostra) ou quando a mesma skin está nos dois lados da vitrine.
 */
export function sidesOf(item: ShowcaseItem, all: readonly ShowcaseItem[]): ('ct' | 't')[] {
  const sides = new Set<'ct' | 't'>();
  for (const other of all) {
    if (other.item.id !== item.item.id || other.slot !== item.slot) continue;
    if (other.side === null) {
      sides.add('ct');
      sides.add('t');
    } else {
      sides.add(other.side);
    }
  }
  return (['ct', 't'] as const).filter((side) => sides.has(side));
}
