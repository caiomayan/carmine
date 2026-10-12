import type { Cs2Item, InventoryItem } from '@carmine/contracts';
import { type AttachmentEntry, attachmentEntry, catalogEntry } from '../catalog/catalog';
import type { CatalogType, Rarity } from '../catalog/types';
import { imageForWear } from '../catalog/wear';
import type { AttachmentLabel } from './item-form';

/**
 * O que a grade do Inventário mostra de cada Item: o Item do contrato com nome, imagem e
 * raridade do catálogo. Montado no servidor (a cs2-lib não vai para o navegador).
 */
export type InventoryCardData = {
  uid: string;
  catalogId: number;
  type: CatalogType | null;
  name: string;
  title: string;
  subtitle: string | null;
  rarity: Rarity;
  image: string;
  statTrak: boolean;
  stickers: number;
  charm: boolean;
  vip: boolean;
};

const labelOf = (entry: AttachmentEntry | undefined, id: number): AttachmentLabel => ({
  id,
  name: entry?.name ?? `#${id}`,
  image: entry?.image ?? '',
});

/** Nome e imagem dos stickers e do charm aplicados, para o editor e o rascunho. */
export function attachmentLabels(item: Cs2Item): AttachmentLabel[] {
  const ids = [
    ...Object.values(item.stickers ?? {}).map((sticker) => sticker.id),
    ...Object.values(item.keychains ?? {}).map((charm) => charm.id),
  ];
  return [...new Set(ids)].map((id) => labelOf(attachmentEntry(id), id));
}

export function toCard({ uid, item }: InventoryItem): InventoryCardData {
  const entry = catalogEntry(item.id);
  // Um Item que saiu do catálogo numa atualização da lib continua no Inventário, sem nome.
  const name = entry?.name ?? `Item #${item.id}`;
  return {
    uid,
    catalogId: item.id,
    type: entry?.type ?? null,
    name,
    title: entry?.title ?? name,
    subtitle: entry?.subtitle ?? null,
    rarity: entry?.rarity ?? 'consumer',
    image: entry ? imageForWear(entry.image, item.wear ?? null) : '',
    statTrak: item.statTrak !== undefined,
    stickers: Object.keys(item.stickers ?? {}).length,
    charm: Object.keys(item.keychains ?? {}).length > 0,
    vip: entry?.vip ?? false,
  };
}
