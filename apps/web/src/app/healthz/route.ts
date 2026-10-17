import { NextResponse } from 'next/server';

/**
 * Saúde do processo do web, para o HEALTHCHECK da imagem. Não renderiza página nem chama a API:
 * o healthcheck roda a cada 15 s a partir do contêiner web (172.30.0.11), e uma página faria SSR e
 * gastaria o balde `public` do rate limit desse IP. A saúde da API e dos dados é de `/api/health`.
 */
export function GET() {
  return NextResponse.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
