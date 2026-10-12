import { ServerBrowser } from '@/components/servers/server-browser';
import { getLiveServers } from '@/lib/api-server';

/**
 * Home = Servidores ao vivo (S06). A página já sai do servidor com a lista daquele instante;
 * no navegador ela segue o ao vivo da API.
 */
export default async function ServersPage() {
  const initial = await getLiveServers();
  return (
    <div className="container-page animate-fade-up">
      <ServerBrowser initial={initial} />
    </div>
  );
}
