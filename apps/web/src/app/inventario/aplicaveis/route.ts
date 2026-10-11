import { NextResponse } from 'next/server';
import { CATALOG_PAGE_SIZE, searchAttachments } from '@/lib/catalog/catalog';
import { RARITIES, type Rarity } from '@/lib/catalog/types';

/**
 * Busca de stickers e charms para aplicar numa skin (`?tipo=sticker|charm&q=&categoria=&mostrar=`).
 * Responde do catálogo da cs2-lib, no servidor do web: os dados da lib não vão para o navegador.
 * Não é rota da API (que vive em /api): o catálogo é público e não depende da Conta.
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = params.get('tipo');
  if (type !== 'sticker' && type !== 'charm') {
    return NextResponse.json({ error: 'tipo deve ser sticker ou charm' }, { status: 400 });
  }
  const rarity = params.get('raridade');
  const shown = Number(params.get('mostrar'));
  const page = searchAttachments(type, {
    q: params.get('q')?.slice(0, 80) || undefined,
    category: params.get('categoria') || undefined,
    rarity:
      rarity && (RARITIES as readonly string[]).includes(rarity) ? (rarity as Rarity) : undefined,
    limit: Number.isInteger(shown) && shown > 0 ? shown : CATALOG_PAGE_SIZE,
  });
  return NextResponse.json(page, {
    // O catálogo só muda quando a cs2-lib muda (novo deploy).
    headers: { 'cache-control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
