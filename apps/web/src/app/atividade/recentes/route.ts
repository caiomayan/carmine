import { NextResponse } from 'next/server';
import { getActivityView } from '@/lib/activity/server';

/**
 * A faixa de atividade da home (Marquee): o navegador pergunta aqui a cada poucos segundos, não à
 * API direto, porque o nome das skins sai do catálogo, que só roda no servidor do web. A leitura
 * é pública (nada da sessão), então pode ser guardada por tão pouco quanto a API a guarda. Com a
 * API fora, 503: a faixa fica como estava.
 */
export async function GET() {
  const view = await getActivityView();
  if (!view) {
    return NextResponse.json(
      { error: 'unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return NextResponse.json(view, { headers: { 'cache-control': 'public, max-age=5' } });
}
