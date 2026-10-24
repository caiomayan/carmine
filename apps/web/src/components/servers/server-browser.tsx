'use client';

import type { LiveServer, LiveServerList, PlayingFriend } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityMarquee } from '@/components/activity/activity-marquee';
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from '@/components/animate-ui/components/radix/tabs';
import { EmptyState } from '@/components/empty-state';
import { RefreshCWIcon } from '@/components/icons/animated/refresh-cw';
import { ServerIcon } from '@/components/icons/animated/server';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { LiveCount } from '@/components/live-count';
import { PageHead } from '@/components/page-head';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import type { ActivityView } from '@/lib/activity/view';
import {
  friendsByServer,
  type LiveState,
  offlineGroupOpen,
  serversLayout,
  serversOfMode,
  updatedSecondsAgo,
  viewFriends,
} from '@/lib/live-servers';
import { MODE_FILTERS, type ModeFilter } from '@/lib/modes';
import { cmd } from './connect';
import { FriendsPlaying } from './friends-playing';
import { ServerCard } from './server-card';
import {
  cardsGridClass,
  cardsImageSizes,
  ServerCardsSkeleton,
  ServerListColumns,
} from './server-list';
import { OfflineGroup } from './server-offline';
import { ServerRow } from './server-row';
import { useFriendsPlaying } from './use-friends-playing';
import { useLiveServers } from './use-live-servers';

/** Cartões da primeira tela carregam a imagem na hora; os de baixo, só ao chegar perto. */
const EAGER_CARDS = 2;

/**
 * Home = Servidores ao vivo (S06, U2): cartões grandes por Modo (lista acima de 6 servidores no
 * ar), que começam com a leitura do servidor do site e seguem o SSE da API, e abaixo "Seus
 * amigos jogando agora", cujos avatares também aparecem no cartão do servidor onde estão.
 */
export function ServerBrowser({
  initial,
  activity,
}: {
  initial: LiveServerList | null;
  activity: ActivityView | null;
}) {
  const t = useTranslations('servers');
  const [mode, setMode] = useState<ModeFilter>('all');
  const { state, retry } = useLiveServers(initial);
  const friends = useFriendsPlaying();
  const servers = state.list?.servers ?? [];
  const friendsOnServer = useMemo(() => friendsByServer(viewFriends(friends.view)), [friends.view]);

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as ModeFilter)} className="gap-0">
      <PageHead title={t('title')} subtitle={t('subtitle')} />
      <div className="grid gap-y-10 pt-2 pb-4">
        <div className="grid min-w-0 gap-y-3">
          <ActivityMarquee initial={activity} />
          <section aria-label={t('listLabel')} className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pb-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <LiveStatus state={state} />
              </div>
              <TabsList aria-label={t('modeFilter')} className="max-md:w-full">
                {MODE_FILTERS.map((m) => (
                  <TabsTrigger key={m} value={m}>
                    {t(`modes.${m}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <p className="mb-3 hidden rounded-md bg-surface px-3 py-2.5 text-body-sm text-muted-foreground pointer-coarse:block">
              {t.rich('connect.mobileHint', { cmd })}
            </p>
            {state.list === null ? (
              <Unavailable connecting={state.connection === 'connecting'} onRetry={retry} />
            ) : (
              <TabsContents>
                {MODE_FILTERS.map((m) => (
                  <TabsContent key={m} value={m}>
                    <ServersOfMode
                      mode={m}
                      servers={serversOfMode(servers, m)}
                      allCount={servers.length}
                      friendsOnServer={friendsOnServer}
                      onShowAll={() => setMode('all')}
                    />
                  </TabsContent>
                ))}
              </TabsContents>
            )}
          </section>
        </div>
        <FriendsPlaying servers={servers} friends={friends} />
      </div>
    </Tabs>
  );
}

/**
 * Os servidores de um Modo: cartões (até 6 no ar) ou lista (acima disso), e os offline num
 * grupo leve no fim. Sem nenhum servidor, o estado vazio do Modo.
 */
function ServersOfMode({
  mode,
  servers,
  allCount,
  friendsOnServer,
  onShowAll,
}: {
  mode: ModeFilter;
  servers: LiveServer[];
  allCount: number;
  friendsOnServer: Map<string, PlayingFriend[]>;
  onShowAll: () => void;
}) {
  const t = useTranslations('servers');
  if (servers.length === 0) {
    return (
      <EmptyList
        title={
          mode === 'all' ? t('empty.title') : t('empty.titleMode', { mode: t(`modes.${mode}`) })
        }
        body={mode === 'all' ? t('empty.body') : t('empty.bodyMode', { mode: t(`modes.${mode}`) })}
        action={
          mode !== 'all' && allCount > 0 ? (
            <Button variant="ghost" onClick={onShowAll}>
              {t('empty.showAll')}
            </Button>
          ) : undefined
        }
      />
    );
  }

  const layout = serversLayout(servers);
  const sizes = cardsImageSizes(layout.columns);

  return (
    <div data-testid="server-list" data-layout={layout.kind}>
      {layout.live.length === 0 ? (
        <p
          role="status"
          className="rounded-xl bg-surface px-4 py-5 text-body text-muted-foreground"
        >
          {t('empty.allOffline')}
        </p>
      ) : layout.kind === 'cards' ? (
        <ul aria-label={t('listLabel')} className={cardsGridClass(layout.columns)}>
          {layout.live.map((server, i) => (
            <ServerCard
              key={server.id}
              server={server}
              friends={friendsOnServer.get(server.id) ?? []}
              index={i}
              solo={layout.live.length === 1}
              sizes={sizes}
              priority={i < EAGER_CARDS}
            />
          ))}
        </ul>
      ) : (
        <>
          <ServerListColumns
            labels={{
              server: t('columns.server'),
              map: t('columns.map'),
              players: t('columns.players'),
              state: t('columns.state'),
            }}
          />
          <ul aria-label={t('listLabel')}>
            {layout.live.map((server, i) => (
              <ServerRow key={server.id} server={server} index={i} />
            ))}
          </ul>
        </>
      )}
      <OfflineGroup
        servers={layout.offline}
        defaultOpen={offlineGroupOpen(layout.live.length, layout.offline.length)}
      />
    </div>
  );
}

/**
 * O "ao vivo" da lista: o ponto, os totais (que rolam quando mudam) e, com a conexão caída,
 * "Reconectando · atualizado há X s". Leitores de tela ouvem só a queda e a volta, não cada
 * segundo da contagem.
 */
function LiveStatus({ state }: { state: LiveState }) {
  const t = useTranslations('servers.live');
  const seconds = useSecondsAgo(state);
  const connection = useShownConnection(state.connection);
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef(connection);

  useEffect(() => {
    if (previous.current === connection) return;
    if (connection === 'lost') setAnnouncement(t('lostAnnounce'));
    else if (connection === 'live' && previous.current === 'lost') {
      setAnnouncement(t('backAnnounce'));
    }
    previous.current = connection;
  }, [connection, t]);

  const summary = state.list?.summary;
  const strong = (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>;

  return (
    <div
      data-testid="live-status"
      data-connection={connection}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-muted-foreground"
    >
      <span className="inline-flex items-center gap-2 label-caps text-[11px] text-foreground">
        <StatusDot
          tone={connection === 'live' ? 'online' : connection === 'lost' ? 'warn' : 'offline'}
          pulse={connection === 'live'}
        />
        {t(connection)}
      </span>
      {connection === 'lost' && seconds !== null ? (
        <span data-testid="live-updated" className="tabular-nums">
          {t('updated', { seconds })}
        </span>
      ) : null}
      {summary ? (
        <span className="inline-flex flex-wrap gap-x-1.5 max-sm:basis-full">
          <span>
            {t.rich('servers', {
              count: summary.online,
              n: () => strong(<LiveCount value={summary.online} />),
            })}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {t.rich('players', {
              count: summary.players,
              n: () => strong(<LiveCount value={summary.players} />),
            })}
          </span>
        </span>
      ) : null}
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}

/** Os segundos do "atualizado há", relidos a cada segundo só enquanto a conexão está caída. */
function useSecondsAgo(state: LiveState): number | null {
  const [now, setNow] = useState(() => Date.now());
  const lost = state.connection === 'lost';
  useEffect(() => {
    if (!lost) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lost]);
  return updatedSecondsAgo(state, now);
}

function EmptyList({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="grid">
      <div
        aria-hidden="true"
        className="[grid-area:1/1] mask-[linear-gradient(180deg,#000_0%,rgb(0_0_0/0.55)_45%,transparent_100%)]"
      >
        <ServerCardsSkeleton count={2} />
      </div>
      <EmptyState
        icon={ServerIcon}
        title={title}
        body={body}
        action={action}
        className="relative isolate animate-fade-up self-center [grid-area:1/1] [animation-delay:180ms] before:absolute before:-inset-x-20 before:-inset-y-4 before:-z-10 before:bg-[radial-gradient(closest-side,var(--bg)_62%,transparent)] max-md:mt-6 max-md:self-start"
      />
    </div>
  );
}

/**
 * Sem nenhum estado conhecido (a API não respondeu ao abrir a página): avisa, nunca mostra
 * uma lista vazia. A conexão ao vivo segue tentando; o botão tenta na hora.
 */
function Unavailable({ connecting, onRetry }: { connecting: boolean; onRetry: () => void }) {
  const t = useTranslations('servers');
  if (connecting) {
    return (
      <div aria-busy="true">
        <p className="sr-only" role="status">
          {t('loading')}
        </p>
        <ServerCardsSkeleton loading />
      </div>
    );
  }
  return (
    <div data-testid="servers-unavailable">
      <EmptyState
        icon={RefreshCWIcon}
        title={t('unavailable.title')}
        body={t('unavailable.body')}
        action={
          <Button variant="ghost" onClick={onRetry}>
            <AnimatedIcon icon={RefreshCWIcon} size={16} />
            {t('unavailable.retry')}
          </Button>
        }
      />
    </div>
  );
}

/** Uma queda mais curta do que isso (o EventSource reconectando sozinho) não vira aviso. */
const LOST_GRACE_MS = 2000;

/**
 * A conexão como a tela mostra: a queda só aparece depois de {@link LOST_GRACE_MS}, para uma
 * reconexão normal (o túnel fechando um stream ocioso) não piscar "Reconectando".
 */
function useShownConnection(connection: LiveState['connection']): LiveState['connection'] {
  const [shown, setShown] = useState(connection);
  useEffect(() => {
    if (connection !== 'lost') {
      setShown(connection);
      return;
    }
    const timer = setTimeout(() => setShown('lost'), LOST_GRACE_MS);
    return () => clearTimeout(timer);
  }, [connection]);
  return shown;
}
