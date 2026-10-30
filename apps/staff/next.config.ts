import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Saída standalone só na imagem Docker (infra/docker/staff.Dockerfile); fora dela, `next start`.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  // O painel nunca é indexado nem embutido em outro site.
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
      ],
    },
  ],
  // O navegador fala com a API sempre na mesma origem, em /api (ADR 0015): cookie first-party `__Host-`, sem
  // CORS. Em produção e na homologação o túnel manda /api/* direto para a API; em desenvolvimento e no E2E o
  // Next repassa (lido no build).
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

export default nextConfig;
