import { type NextRequest, NextResponse } from 'next/server';
import { findPublicIdBySteamId } from '@/lib/api-base';
import { PROFILE_PATH_HEADER, parseProfileSegment } from '@/lib/auth-links';

/**
 * Caminhos de um segmento só com dígitos são endereços de Perfil (S03):
 *
 * - `stcarmine.com/<SteamID64>` redireciona com 301 para `/<idPúblico>`. Fica aqui porque o
 *   `permanentRedirect` de uma página responde 308. Sem Conta para o SteamID, ou com a API
 *   fora do ar, segue para a página, que mostra o 404 ou o aviso de instabilidade.
 * - O 404 deles é o do Perfil ("Nenhum Perfil com esse ID"); outros caminhos de um segmento
 *   que caem na mesma rota dinâmica (`/nao-existe`) ficam com o 404 geral.
 */
export async function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(PROFILE_PATH_HEADER, '1');
  const next = () => NextResponse.next({ request: { headers } });

  const parsed = parseProfileSegment(request.nextUrl.pathname.slice(1));
  if (parsed.kind !== 'steamId') return next();

  const publicId = await findPublicIdBySteamId(parsed.steamId);
  if (typeof publicId !== 'number') return next();

  const target = request.nextUrl.clone();
  target.pathname = `/${publicId}`;
  return NextResponse.redirect(target, 301);
}

export const config = {
  matcher: '/:segment([0-9]+)',
};
