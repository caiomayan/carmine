import { NextResponse } from 'next/server';
import { getLoadoutsWeek } from '@/lib/home/server';
import type { LoadoutsWeek } from '@/lib/home/types';

/**
 * A vitrine "Loadouts da semana" da Home: o navegador pede aqui quando a faixa chega perto da tela, e não na
 * primeira pintura, porque ela junta o Perfil de cada um dos melhores da semana (várias leituras à API) e o
 * catálogo da cs2-lib, que só roda no servidor do site. Só dado público (Perfil público e Ranking), então pode
 * ser guardado por um minuto. Com a API fora, vazio: a faixa some em vez de mostrar erro.
 */
export async function GET() {
  const entries = await getLoadoutsWeek();
  const body: LoadoutsWeek = { entries };
  return NextResponse.json(body, { headers: { 'cache-control': 'public, max-age=60' } });
}
