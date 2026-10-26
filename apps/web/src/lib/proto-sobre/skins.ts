import { quickSearchCatalog } from '@/lib/catalog/catalog';
import type { Rarity } from '@/lib/catalog/types';
import { skinPalette } from '@/lib/skin-palette';

/**
 * Skins de vitrine para os protótipos do Sobre e da carta: achadas no catálogo de verdade pela busca (PT-BR ou
 * inglês), com as cores vivas e a raridade. **Só no servidor** (o catálogo da cs2-lib passa de 13 MB). Uma busca que
 * não acha nada é pulada: o protótipo nunca quebra por causa de um nome.
 */
export type ShowSkin = {
  id: number;
  title: string;
  subtitle: string | null;
  image: string;
  rarity: Rarity;
  /** As cores vivas da skin; nulo se ela não tem paleta. */
  palette: readonly string[] | null;
};

export function pickSkin(query: string): ShowSkin | null {
  const hit = quickSearchCatalog(query, 1)[0]?.entry;
  if (!hit) return null;
  return {
    id: hit.id,
    title: hit.title,
    subtitle: hit.subtitle,
    image: hit.image,
    rarity: hit.rarity,
    palette: skinPalette(hit.id),
  };
}

export function pickSkins(queries: readonly string[]): ShowSkin[] {
  return queries.map(pickSkin).filter((skin): skin is ShowSkin => skin !== null);
}
