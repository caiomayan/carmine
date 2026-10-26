'use client';

import type { LiveServer, LiveServerList } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/empty-state';
import { RefreshCWIcon } from '@/components/icons/animated/refresh-cw';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { useLiveServers } from '@/components/servers/use-live-servers';
import { Button } from '@/components/ui/button';
import type { ArtPair } from '@/components/vida/map-art';
import { type InitialExtras, useServerExtras } from '@/lib/server-page/use-server-extras';
import { ServerPageView } from './server-page-view';

/**
 * A página do servidor ao vivo: começa com a leitura do servidor do site e segue o SSE da lista de servidores (o
 * mesmo da Home), então estado, mapa e vagas mudam na hora. Se o servidor sai da lista (descadastrado enquanto a
 * página está aberta), a página fica com o último estado conhecido.
 */
export function ServerPageLive({
  id,
  initial,
  initialExtras,
  art,
}: {
  id: string;
  /** A lista lida no servidor do site; nula com a API fora. */
  initial: LiveServerList | null;
  /** Os jogadores e o histórico lidos no servidor do site (nulos: a API não respondeu ou a rota não existe ainda). */
  initialExtras: InitialExtras;
  art: Record<string, ArtPair>;
}) {
  const { state, retry } = useLiveServers(initial);
  const server =
    state.list?.servers.find((row) => row.id === id) ??
    initial?.servers.find((row) => row.id === id) ??
    null;

  if (!server) return <Unavailable onRetry={retry} />;
  return <Loaded server={server} initialExtras={initialExtras} art={art} />;
}

function Loaded({
  server,
  initialExtras,
  art,
}: {
  server: LiveServer;
  initialExtras: InitialExtras;
  art: Record<string, ArtPair>;
}) {
  const extras = useServerExtras(server, initialExtras);
  return <ServerPageView server={server} extras={extras} art={art} />;
}

/** A API não respondeu e a página ainda não tem o servidor: o aviso com "tentar de novo", como na Home. */
function Unavailable({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('servers.unavailable');
  return (
    <div className="container-page pt-14 pb-24 max-md:pt-9" data-testid="servers-unavailable">
      <EmptyState
        icon={RefreshCWIcon}
        title={t('title')}
        body={t('body')}
        action={
          <Button variant="ghost" onClick={onRetry}>
            <AnimatedIcon icon={RefreshCWIcon} size={16} />
            {t('retry')}
          </Button>
        }
      />
    </div>
  );
}
