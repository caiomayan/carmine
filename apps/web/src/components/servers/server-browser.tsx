'use client';

import type { LiveServerList } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
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
import { type LiveState, serversOfMode, updatedSecondsAgo } from '@/lib/live-servers';
import { MODE_FILTERS, type ModeFilter } from '@/lib/modes';
import { FriendsPlaying } from './friends-playing';
import { ServerListColumns, ServerRowSkeleton } from './server-list';
import { cmd, ServerRow } from './server-row';
import { useLiveServers } from './use-live-servers';

const GHOST_ROWS = ['ghost-1', 'ghost-2', 'ghost-3', 'ghost-4'];

/**
 * Home = Servidores ao vivo (S06): a lista por Modo, que começa com a leitura do servidor do
 * site e segue o SSE da API, e ao lado "Seus amigos jogando agora".
 */
export function ServerBrowser({ initial }: { initial: LiveServerList | null }) {
  const t = useTranslations('servers');
  const [mode, setMode] = useState<ModeFilter>('all');
  const { state, retry } = useLiveServers(initial);
  const servers = state.list?.servers ?? [];

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as ModeFilter)} className="gap-0">
      <PageHead
        title={t('title')}
        subtitle={t('subtitle')}
        aside={
          <TabsList aria-label={t('modeFilter')} className="max-md:w-full">
            {MODE_FILTERS.map((m) => (
              <TabsTrigger key={m} value={m}>
                {t(`modes.${m}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        }
      />
      <div className="grid gap-x-8 gap-y-10 pt-2 pb-4 lg:grid-cols-[minmax(0,1fr)_288px]">
        <section aria-labelledby="regiao-sao-paulo" className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
            <h2
              id="regiao-sao-paulo"
              className="inline-flex items-center gap-2.5 label-caps text-[11px] text-foreground"
            >
              <span aria-hidden="true" className="size-1.5 rotate-45 bg-foreground" />
              {t('regions.sao-paulo')}
            </h2>
            <LiveStatus state={state} />
          </div>
          <p className="mb-3 hidden rounded-md bg-surface px-3 py-2.5 text-[13px] text-muted-foreground pointer-coarse:block">
            {t.rich('connect.mobileHint', { cmd })}
          </p>
          <ServerListColumns
            labels={{
              server: t('columns.server'),
              map: t('columns.map'),
              players: t('columns.players'),
              state: t('columns.state'),
            }}
          />
          {state.list === null ? (
            <Unavailable connecting={state.connection === 'connecting'} onRetry={retry} />
          ) : (
            <TabsContents>
              {MODE_FILTERS.map((m) => {
                const list = serversOfMode(servers, m);
                return (
                  <TabsContent
                    key={m}
                    value={m}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {list.length > 0 ? (
                      <ul aria-label={t('listLabel')} data-testid="server-list">
                        {list.map((server, i) => (
                          <ServerRow key={server.id} server={server} index={i} />
                        ))}
                      </ul>
                    ) : (
                      <EmptyList
                        title={
                          m === 'all'
                            ? t('empty.title')
                            : t('empty.titleMode', { mode: t(`modes.${m}`) })
                        }
                        body={
                          m === 'all'
                            ? t('empty.body')
                            : t('empty.bodyMode', { mode: t(`modes.${m}`) })
                        }
                        action={
                          m !== 'all' && servers.length > 0 ? (
                            <Button variant="ghost" onClick={() => setMode('all')}>
                              {t('empty.showAll')}
                            </Button>
                          ) : undefined
                        }
                      />
                    )}
                  </TabsContent>
                );
              })}
            </TabsContents>
          )}
        </section>
        <FriendsPlaying servers={servers} />
      </div>
    </Tabs>
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
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef(state.connection);

  useEffect(() => {
    if (previous.current === state.connection) return;
    if (state.connection === 'lost') setAnnouncement(t('lostAnnounce'));
    else if (state.connection === 'live' && previous.current === 'lost') {
      setAnnouncement(t('backAnnounce'));
    }
    previous.current = state.connection;
  }, [state.connection, t]);

  const summary = state.list?.summary;
  const strong = (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>;

  return (
    <div
      data-testid="live-status"
      data-connection={state.connection}
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground"
    >
      <span className="inline-flex items-center gap-2 label-caps text-[10.5px] text-foreground">
        <StatusDot
          tone={
            state.connection === 'live'
              ? 'online'
              : state.connection === 'lost'
                ? 'warn'
                : 'offline'
          }
          pulse={state.connection === 'live'}
        />
        {t(state.connection)}
      </span>
      {state.connection === 'lost' && seconds !== null ? (
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
        {GHOST_ROWS.map((id, i) => (
          <ServerRowSkeleton key={id} index={i} />
        ))}
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
        <div aria-hidden="true">
          {GHOST_ROWS.map((id, i) => (
            <ServerRowSkeleton key={id} index={i} loading />
          ))}
        </div>
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
