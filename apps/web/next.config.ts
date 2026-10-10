import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Saída standalone só na imagem Docker (infra/docker/web.Dockerfile); fora dela, `next start`.
  // A raiz do monorepo entra no tracing para os pacotes do workspace serem copiados.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  // A imagem é construída uma vez e serve amd64 e arm64, então nada nativo vai para o runtime:
  // sem otimização de imagem, o sharp (binário por plataforma) não é usado e o Dockerfile o remove.
  images: { unoptimized: true },
  typedRoutes: true,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default withNextIntl(nextConfig);
