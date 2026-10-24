import { HomeLive } from '@/components/home/home-live';
import { getHomeData } from '@/lib/home/server';

/**
 * Home = o painel ao vivo (V2). A página já sai do servidor com tudo o que mostra na primeira pintura (servidores,
 * atividade, top 3, os números da semana, a sessão); no navegador, a lista segue o ao vivo da API e a atividade se
 * atualiza sozinha. A vitrine dos Loadouts chega depois, quando a faixa se aproxima da tela.
 */
export default async function ServersPage() {
  return <HomeLive data={await getHomeData()} />;
}
