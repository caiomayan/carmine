import type { LoadoutSlot } from '@carmine/contracts';
import { NextResponse } from 'next/server';
import { getHeaderPreviews } from '@/lib/api-server';
import { catalogEntry } from '@/lib/catalog/catalog';
import { hasSkinName } from '@/lib/catalog/types';
import { buildHeaderView, type CatalogLookup } from '@/lib/header-previews/build';
import { slotDefault } from '@/lib/loadout/slots';

const PRIVATE = { 'cache-control': 'private, no-store' };

/** O catálogo da cs2-lib como o montador o usa: só no servidor do web, nunca no navegador. */
const lookup: CatalogLookup = {
  item(itemId) {
    const entry = catalogEntry(itemId);
    if (!entry) return null;
    return {
      title: entry.title,
      subtitle: entry.subtitle,
      image: entry.image,
      skinFirst: hasSkinName(entry.type),
    };
  },
  slotDefault: (slot, side) => slotDefault(slot as LoadoutSlot, side),
};

/**
 * As prévias dos painéis do header (U3e): `?side=ct|t` (o último lado do Loadout, que só o
 * navegador guarda). Pede à API (com a sessão) e responde o que os painéis desenham, com nomes e
 * imagens do catálogo e nenhum SteamID. O navegador chama isto no primeiro hover do header, não a
 * API direto: o catálogo só roda aqui. Com a API fora, 503 (o painel diz que não carregou).
 */
export async function GET(request: Request) {
  const side = new URL(request.url).searchParams.get('side') === 't' ? 't' : 'ct';
  const previews = await getHeaderPreviews(side);
  if (!previews) {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: PRIVATE });
  }
  return NextResponse.json(buildHeaderView(previews, lookup), { headers: PRIVATE });
}
