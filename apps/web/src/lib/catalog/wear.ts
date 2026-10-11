/**
 * Desgaste (float) no navegador, sem a cs2-lib: os mesmos cortes e a mesma troca de imagem
 * que ela usa (`getWearFromValue` e `getImageUrl`).
 */

export const WEAR_TIERS = ['fn', 'mw', 'ft', 'ww', 'bs'] as const;
export type WearTier = (typeof WEAR_TIERS)[number];

/** Teto de cada faixa: Nova de Fábrica até 0,07, Pouco Usada até 0,15, e assim por diante. */
export const WEAR_TIER_MAX: Record<WearTier, number> = {
  fn: 0.07,
  mw: 0.15,
  ft: 0.37,
  ww: 0.44,
  bs: 1,
};

export function wearTier(wear: number): WearTier {
  return WEAR_TIERS.find((tier) => wear <= WEAR_TIER_MAX[tier]) ?? 'bs';
}

/** A imagem 2D da skin com o desgaste aproximado do float (três variantes na CDN da lib). */
export function imageForWear(image: string, wear: number | null): string {
  if (wear === null) return image;
  const variant = wear < 1 / 3 ? 'light' : wear < 2 / 3 ? 'medium' : 'heavy';
  return image.replace(/\.webp$/, `_${variant}.webp`);
}
