import { type NextRequest, NextResponse } from 'next/server';
import { findPublicIdBySteamId, VISITOR_IP_HEADER } from '@/lib/api-base';
import { PROFILE_PATH_HEADER, parseProfileSegment } from '@/lib/auth-links';
import { buildContentSecurityPolicy, generateNonce, NONCE_HEADER } from '@/lib/security-headers';

const NUMERIC_PATH = /^\/[0-9]+$/;

/**
 * Roda em toda página (menos `/api`, estáticos e prefetch) e faz duas coisas:
 *
 * - Define a CSP da resposta com um nonce novo, que o Next lê do cabeçalho da requisição para
 *   marcar os próprios scripts e que o layout usa no script do tema (`NONCE_HEADER`).
 * - Caminhos de um segmento só com dígitos são endereços de Perfil (S03):
 *   `stcarmine.com/<SteamID64>` redireciona com 301 para `/<idPúblico>`. Fica aqui porque o
 *   `permanentRedirect` de uma página responde 308. Sem Conta para o SteamID, ou com a API
 *   fora do ar, segue para a página, que mostra o 404 ou o aviso de instabilidade.
 *   O 404 deles é o do Perfil ("Nenhum Perfil com esse ID"); outros caminhos de um segmento
 *   que caem na mesma rota dinâmica (`/nao-existe`) ficam com o 404 geral.
 */
export async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    dev: process.env.NODE_ENV === 'development',
  });

  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  headers.set('content-security-policy', csp);
  const numericPath = NUMERIC_PATH.test(request.nextUrl.pathname);
  if (numericPath) headers.set(PROFILE_PATH_HEADER, '1');

  const next = () => {
    const response = NextResponse.next({ request: { headers } });
    response.headers.set('content-security-policy', csp);
    return response;
  };

  if (!numericPath) return next();
  const parsed = parseProfileSegment(request.nextUrl.pathname.slice(1));
  if (parsed.kind !== 'steamId') return next();

  const publicId = await findPublicIdBySteamId(
    parsed.steamId,
    request.headers.get(VISITOR_IP_HEADER),
  );
  if (typeof publicId !== 'number') return next();

  const target = request.nextUrl.clone();
  target.pathname = `/${publicId}`;
  return NextResponse.redirect(target, 301);
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
