/*
 * Adaptado de app/viewer.ts do CS2 Inventory Simulator, © Ian Lucas, licença MIT
 * (ver LICENSE.md nesta pasta). Sem a cs2-lib: recebe o Item já no formato do contrato.
 */
import type { Cs2Item } from '@carmine/contracts';

export const VIEWER_EMBED_URL = 'https://3d.cstrike.app/view';
export const VIEWER_ORIGIN = new URL(VIEWER_EMBED_URL).origin;

/** O que o viewer lê de um Item (o mesmo formato do `?item=`). */
export type ViewerItem = Pick<
  Cs2Item,
  'id' | 'seed' | 'wear' | 'stickers' | 'keychains' | 'statTrak' | 'nameTag'
>;

export function toViewerItem(item: Cs2Item): ViewerItem {
  const viewerItem: ViewerItem = { id: item.id };
  if (item.seed !== undefined) viewerItem.seed = item.seed;
  if (item.wear !== undefined) viewerItem.wear = item.wear;
  if (item.stickers !== undefined) viewerItem.stickers = item.stickers;
  if (item.keychains !== undefined) viewerItem.keychains = item.keychains;
  if (item.statTrak !== undefined) viewerItem.statTrak = item.statTrak;
  if (item.nameTag !== undefined) viewerItem.nameTag = item.nameTag;
  return viewerItem;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);
  return `{${entries.join(',')}}`;
}

/** Texto estável do Item: a mesma combinação dá o mesmo texto, em qualquer ordem de chaves. */
export function stringifyViewerItem(item: Cs2Item): string {
  return stableStringify(toViewerItem(item));
}

/**
 * O endereço do iframe com o Item inicial. `key` é a partner key (pedida antes do lançamento,
 * ADR 0006); sem ela o viewer usa o nível público, com marca d'água e limite por IP.
 */
export function buildViewerSrc(item: Cs2Item, options: { key?: string } = {}): string {
  const url = new URL(VIEWER_EMBED_URL);
  url.searchParams.set('halfRotation', '1');
  url.searchParams.set('item', stringifyViewerItem(item));
  if (options.key) url.searchParams.set('key', options.key);
  return url.toString();
}
