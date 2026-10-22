import { type CS2EconomyItem, CS2RarityColor } from '@ianlucas/cs2-lib';

/** Raridades de arma que valem o destaque: secreta, oculta e contrabando (as constantes da cs2-lib). */
const NOTABLE_RARITY_COLORS: ReadonlySet<string> = new Set([
  CS2RarityColor.Legendary,
  CS2RarityColor.Ancient,
  CS2RarityColor.Immortal,
]);

/**
 * A skin equipada merece aparecer na faixa de atividade? Facas e luvas pintadas, e skins de arma
 * das raridades altas. Sem pintura (faca lisa, arma padrão), agente, kit de música e adesivo, não.
 */
export function isNotableSkin(item: CS2EconomyItem): boolean {
  if (item.isDefault || item.isBase) return false;
  if (item.type === 'melee' || item.type === 'glove') return true;
  return item.type === 'weapon' && NOTABLE_RARITY_COLORS.has(item.rarityColor);
}
