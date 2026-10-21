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

export type WearSegment = { tier: WearTier; width: number };

/**
 * As fases do desgaste que a faixa da skin alcança, com a largura de cada uma em % da barra
 * (somam 100). Uma skin que só vai de 0,06 a 0,80 não tem a Nova de Fábrica inteira.
 */
export function wearSegments(range: { min: number; max: number }): WearSegment[] {
  const span = range.max - range.min;
  if (span <= 0) return [{ tier: wearTier(range.min), width: 100 }];
  const segments: WearSegment[] = [];
  WEAR_TIERS.forEach((tier, index) => {
    const start = index === 0 ? 0 : WEAR_TIER_MAX[WEAR_TIERS[index - 1] ?? 'fn'];
    const from = Math.max(start, range.min);
    const to = Math.min(WEAR_TIER_MAX[tier], range.max);
    if (to > from) segments.push({ tier, width: ((to - from) / span) * 100 });
  });
  return segments;
}

/**
 * O fundo do trilho do float: uma faixa por fase (verde da Nova de Fábrica ao vermelho da
 * Veterana de Guerra), em paradas duras, com as cores de contexto `--wear-*`.
 */
export function wearGradient(segments: WearSegment[]): string {
  let at = 0;
  const stops = segments.map(({ tier, width }, index) => {
    const from = at;
    at = index === segments.length - 1 ? 100 : at + width;
    return `var(--wear-${tier}) ${Number(from.toFixed(3))}% ${Number(at.toFixed(3))}%`;
  });
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}
