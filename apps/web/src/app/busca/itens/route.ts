import { NextResponse } from 'next/server';
import { getInventory } from '@/lib/api-server';
import { type CatalogEntry, quickSearchCatalog, quickSearchOwned } from '@/lib/catalog/catalog';
import { hasSkinName } from '@/lib/catalog/types';
import { ITEM_SEARCH_LIMIT, type ItemHit, type ItemSearch } from '@/lib/search/items';

/**
 * Itens para a paleta de comandos (Ctrl+K, U3d): `?q=` acha no catálogo e, para quem entrou, no
 * Inventário (cada cópia é um resultado, que leva ao editor). Responde do catálogo da cs2-lib no
 * servidor do web: os dados da lib não vão para o navegador. Como depende da sessão (o
 * Inventário), a resposta nunca fica em cache compartilhado.
 */
const hitOf = (entry: CatalogEntry, score: number, uid?: string): ItemHit => ({
  id: entry.id,
  ...(uid && { uid }),
  title: entry.title,
  subtitle: entry.subtitle,
  skinFirst: hasSkinName(entry.type),
  rarity: entry.rarity,
  image: entry.image,
  score,
});

const PRIVATE = { 'cache-control': 'private, no-store' };

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? '';
  const none: ItemSearch = { inventory: [], catalog: [] };
  // Busca curta demais não vale uma ida à API pelo Inventário.
  if (q.trim().length < 2) return NextResponse.json(none, { headers: PRIVATE });
  const catalog = quickSearchCatalog(q, ITEM_SEARCH_LIMIT).map(({ entry, score }) =>
    hitOf(entry, score),
  );
  const owned = await getInventory();
  const inventory =
    owned.status === 'ok'
      ? quickSearchOwned(
          owned.inventory.items.map(({ uid, item }) => ({ uid, itemId: item.id })),
          q,
          ITEM_SEARCH_LIMIT,
        ).map(({ entry, score, uid }) => hitOf(entry, score, uid))
      : [];
  const body: ItemSearch = { inventory, catalog };
  return NextResponse.json(body, { headers: PRIVATE });
}
