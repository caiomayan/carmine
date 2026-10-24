import { ServerBrowser } from '@/components/servers/server-browser';
import { getActivityView } from '@/lib/activity/server';
import { getLiveServers } from '@/lib/api-server';

/**
 * Home = Servidores ao vivo (S06). A página já sai do servidor com a lista daquele instante;
 * no navegador ela segue o ao vivo da API. A faixa de atividade é lida em paralelo; sem ela a home é a mesma.
 */
export default async function ServersPage() {
  const [initial, activity] = await Promise.all([getLiveServers(), getActivityView()]);
  return (
    <div className="container-page animate-fade-up">
      <ServerBrowser initial={initial} activity={activity} />
    </div>
  );
}
