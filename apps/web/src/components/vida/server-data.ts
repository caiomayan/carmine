import { catalogEntry } from '@/lib/catalog/catalog';
import { type SkinInfo, skinPalette } from './data';

/** Só no servidor (o catálogo da cs2-lib nunca vai ao navegador): nome, raridade e imagem de uma skin. */
export function skinInfo(id: number): SkinInfo {
  const entry = catalogEntry(id);
  return {
    id,
    title: entry?.title ?? `Item #${id}`,
    subtitle: entry?.subtitle ?? null,
    rarity: entry?.rarity ?? 'consumer',
    image: entry?.image ?? '',
    // Sem paleta extraída, a cor da raridade faz o papel (nunca um vermelho de reserva).
    colors: ((p, r) => [p?.[0] ?? r, p?.[1] ?? p?.[0] ?? r, p?.[2] ?? p?.[1] ?? p?.[0] ?? r] as [string, string, string])(
      skinPalette(id),
      `var(--rarity-${entry?.rarity ?? 'consumer'})`,
    ),
    foil: entry?.type === 'knife' || entry?.type === 'glove',
  };
}

export function skinTable(ids: number[]): Record<number, SkinInfo> {
  return Object.fromEntries(ids.map((id) => [id, skinInfo(id)]));
}
