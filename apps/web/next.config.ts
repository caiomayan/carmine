import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { staticSecurityHeaders } from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Saída standalone só na imagem Docker (infra/docker/web.Dockerfile); fora dela, `next start`.
  // A raiz do monorepo entra no tracing para os pacotes do workspace serem copiados.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  // Os documentos legais (docs/legal/*.md) são lidos em tempo de requisição: entram no standalone.
  outputFileTracingIncludes: {
    '/regras': ['../../docs/legal/**/*.md'],
    '/termos': ['../../docs/legal/**/*.md'],
    '/privacidade': ['../../docs/legal/**/*.md'],
    '/reembolso': ['../../docs/legal/**/*.md'],
  },
  // A imagem é construída uma vez e serve amd64 e arm64, então nada nativo vai para o runtime:
  // sem otimização de imagem, o sharp (binário por plataforma) não é usado e o Dockerfile o remove.
  images: { unoptimized: true },
  typedRoutes: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Cabeçalhos fixos de segurança; a CSP, que muda por requisição (nonce), vem do proxy.ts.
  headers: async () => [
    {
      source: '/:path*',
      headers: staticSecurityHeaders({ production: process.env.NODE_ENV === 'production' }),
    },
  ],
  // O navegador fala com a API sempre na mesma origem, em /api (ADR 0015): cookies first-party,
  // sem CORS. Em produção o Cloudflare Tunnel manda /api/* direto para a API e isto nunca é
  // usado; em desenvolvimento e no E2E, o Next repassa /api/* para a API (lido no build).
  // Em beforeFiles, nenhuma página do web pode encobrir uma rota da API.
  rewrites: async () => ({
    beforeFiles: [
      {
        source: '/api/:path*',
        destination: `${(process.env.API_URL ?? 'http://localhost:3333').replace(/\/+$/, '')}/api/:path*`,
      },
    ],
    afterFiles: [],
    fallback: [],
  }),
};

export default withNextIntl(nextConfig);
