import { catalogEntry } from '@/lib/catalog/catalog';
import { type SkinInfo, skinColors } from './data';

/** Só no servidor (o catálogo da cs2-lib nunca vai ao navegador): nome, raridade e imagem de uma skin. */
export function skinInfo(id: number): SkinInfo {
  const entry = catalogEntry(id);
  return {
    id,
    title: entry?.title ?? `Item #${id}`,
    subtitle: entry?.subtitle ?? null,
    rarity: entry?.rarity ?? 'consumer',
    image: entry?.image ?? '',
    colors: skinColors(id),
  };
}

export function skinTable(ids: number[]): Record<number, SkinInfo> {
  return Object.fromEntries(ids.map((id) => [id, skinInfo(id)]));
}
