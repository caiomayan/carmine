import { VIEWER_ORIGIN } from './viewer/viewer-src';

/** Cabeçalho (só de requisição, entre o proxy e o layout) com o nonce do `<script>` do tema. */
export const NONCE_HEADER = 'x-nonce';

/** CDN das imagens dos Itens (`cs2-lib`) e dos avatares da Steam: o único conteúdo externo do site. */
const IMAGE_ORIGINS = ['https://cdn.cstrike.app', 'https://*.steamstatic.com'];

export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * CSP por requisição (ADR 0015: tudo na mesma origem). Nonce com `strict-dynamic` em vez de
 * `'unsafe-inline'` em `script-src`: toda página já é renderizada por requisição (o layout lê
 * o cookie da sessão), então o nonce não custa cache nem páginas estáticas. Os estilos ficam
 * com `'unsafe-inline'` porque o React escreve `style="..."` no HTML do servidor (atributos
 * não aceitam nonce) e injeção de CSS rende muito menos que injeção de script.
 */
export function buildContentSecurityPolicy({
  nonce,
  dev,
  reportingOrigin = null,
}: {
  nonce: string;
  dev: boolean;
  /** Origem de ingestão do Sentry (do DSN), a única conexão externa do navegador. */
  reportingOrigin?: string | null;
}): string {
  return [
    "default-src 'self'",
    // No desenvolvimento o React usa eval para reconstruir as pilhas de erro do servidor.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${IMAGE_ORIGINS.join(' ')}`,
    "font-src 'self'",
    `connect-src 'self'${reportingOrigin ? ` ${reportingOrigin}` : ''}`,
    `frame-src ${VIEWER_ORIGIN}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

export interface HeaderEntry {
  key: string;
  value: string;
}

/** Cabeçalhos que não mudam por requisição, para todas as respostas do web (`next.config.ts`). */
export function staticSecurityHeaders({ production }: { production: boolean }): HeaderEntry[] {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()',
    },
    // O navegador ignora HSTS em http; só entra em produção para não grudar em localhost.
    ...(production
      ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
      : []),
  ];
}
