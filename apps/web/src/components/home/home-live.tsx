'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useEffect, useState } from 'react';
import { EmptyState } from '@/components/empty-state';
import { RefreshCWIcon } from '@/components/icons/animated/refresh-cw';
import { ServerIcon } from '@/components/icons/animated/server';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { cmd } from '@/components/servers/connect';
import { useFriendsPlaying } from '@/components/servers/use-friends-playing';
import { useLiveServers } from '@/components/servers/use-live-servers';
import { useSession } from '@/components/session/session-provider';
import { Button } from '@/components/ui/button';
import { choicePalette } from '@/components/vida/map-art';
import { MapPicture, useNight } from '@/components/vida/map-picture';
import {
  featuredServer,
  type HomeState,
  homeState,
  isLiveServer,
  totalPlayers,
} from '@/lib/home/state';
import type { HomeData } from '@/lib/home/types';
import {
  friendsByServer,
  friendsWithServers,
  offlineGroupOpen,
  viewFriends,
} from '@/lib/live-servers';
import { cn } from '@/lib/utils';
import { ActivityStrip } from './activity-strip';
import { Hero } from './hero';
import { InView } from './in-view';
import { LiveStatus } from './live-status';
import { OfflineGroup } from './offline-group';
import { FeedPanel, FriendsPanel, TopPanel } from './rail';
import { ServerCard } from './server-card';
import { HomeSkeleton, LoadoutsSkeleton } from './skeleton';
import { useActivity } from './use-activity';
import { WeekStrip } from './week-strip';

const LoadoutsWeek = dynamic(() => import('./loadouts-week'), {
  ssr: false,
  loading: () => <LoadoutsSkeleton />,
});

type Colors = [string, string, string];

/** As 3 cores de uma paleta de skin (a última se repete quando faltam). */
function colorsOf(palette: readonly string[]): Colors {
  const a = palette[0] ?? '#888888';
  const b = palette[1] ?? a;
  return [a, b, palette[2] ?? b];
}

/**
 * A arte do hero: o mapa em foco, de borda a borda; ao trocar de mapa a nova arte entra por cima da anterior. O
 * servidor que dorme a escurece (o mesmo mapa, em cinza).
 */
function HeroArt({
  map,
  art,
  asleep,
}: {
  map: string | null;
  art: HomeData['art'];
  asleep: boolean;
}) {
  const [layers, setLayers] = useState<{ map: string; id: number }[]>(map ? [{ map, id: 0 }] : []);
  const [lastMap, setLastMap] = useState(map);
  // Ao trocar de mapa a nova arte entra por cima; a anterior sai quando a transição acaba.
  if (map !== lastMap) {
    setLastMap(map);
    setLayers((prev) => (map ? [...prev.slice(-1), { map, id: (prev.at(-1)?.id ?? 0) + 1 }] : []));
  }
  const newest = layers.length > 1 ? layers.at(-1)?.id : null;
  useEffect(() => {
    if (newest === null) return;
    const timer = setTimeout(() => setLayers((prev) => prev.slice(-1)), 900);
    return () => clearTimeout(timer);
  }, [newest]);
  if (layers.length === 0) return null;
  return (
    <div aria-hidden="true" className="vh-hero-art" data-testid="home-hero-art">
      {layers.map((layer, i) => (
        <MapPicture
          key={layer.id}
          map={layer.map}
          art={art[layer.map]}
          priority={i === 0}
          sizes="100vw"
          className={i === 0 ? 'size-full' : 'absolute inset-0 size-full'}
          imgStyle={{
            animation: i > 0 ? 'vh-art-in 700ms var(--ease-out) both' : undefined,
            filter: asleep ? 'grayscale(0.45) brightness(0.62)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

/**
 * A Home (V2 do redesenho "Vida"): o painel ao vivo. Em 2 colunas a partir de 1280 px: o hero e os servidores à
 * esquerda e o trilho (amigos, atividade, top 3) à direita; abaixo disso o trilho se desfaz, os amigos vêm logo
 * depois do hero e a atividade vira o Marquee. Os dados são reais: a lista de servidores começa com a leitura do
 * servidor do site e segue o SSE da API, os amigos vêm da Steam, a atividade do #71, o top 3 do Ranking e a semana
 * de `account_stats_weekly`. O que a API não deu vira o estado vazio do bloco, nunca um número inventado.
 */
export function HomeLive({ data }: { data: HomeData }) {
  const t = useTranslations('home');
  const ts = useTranslations('servers');
  const { state: live, retry } = useLiveServers(data.servers);
  const friends = useFriendsPlaying();
  const { status: sessionStatus } = useSession();
  const signedIn =
    sessionStatus === 'authenticated' || (sessionStatus === 'unknown' && data.signedIn);

  const servers = live.list?.servers ?? [];
  const liveServers = servers.filter(isLiveServer);
  const offlineServers = servers.filter((server) => !isLiveServer(server));
  const total = totalPlayers(servers);
  const featured = featuredServer(servers);
  const friendsOnServers = friendsWithServers(viewFriends(friends.view), servers);
  const friendsNow = friendsOnServers.filter((entry) => entry.joinable);
  const byServer = friendsByServer(friendsNow.map((entry) => entry.friend));

  const state: HomeState = homeState({
    listLoaded: live.list !== null,
    connecting: live.connection === 'connecting',
    liveCount: liveServers.length,
    signedIn,
    friendsNow: friendsNow.length,
  });
  const asleep = state === 'offline';

  const [hoverMap, setHoverMap] = useState<string | null>(null);
  const activeMap = hoverMap ?? featured?.map ?? null;
  const night = useNight();
  const choiceOf = (map: string | null | undefined) => {
    const pair = map ? data.art[map] : undefined;
    return pair ? (night ? pair.night : pair.day) : null;
  };
  // Cor ambiente: o mapa sob o ponteiro; senão a skin em destaque de quem está logado; senão o mapa em destaque.
  const mapColors = (map: string | null | undefined): Colors | null => {
    const choice = choiceOf(map);
    return choice ? choicePalette(choice) : null;
  };
  const ambient: Colors | null =
    (hoverMap ? mapColors(hoverMap) : null) ??
    (signedIn && data.ambient ? colorsOf(data.ambient) : null) ??
    mapColors(featured?.map);

  const { items: activity, fresh } = useActivity(data.activity);
  const lastSeen =
    offlineServers
      .map((server) => server.lastHeartbeatAt)
      .filter((at): at is string => at !== null)
      .sort()
      .at(-1) ?? null;

  if (state === 'carregando') return <HomeSkeleton label={ts('loading')} />;

  const soloLive = liveServers.length === 1;
  const hasLoadout = data.hasLoadout;

  return (
    <div
      data-vida="on"
      data-state={state}
      data-testid="home"
      data-map={activeMap ?? undefined}
      style={
        ambient
          ? ({
              '--amb-1': ambient[0],
              '--amb-2': ambient[1],
              '--amb-3': ambient[2],
            } as CSSProperties)
          : undefined
      }
    >
      <div aria-hidden="true" className="v-ambient">
        <i />
        <i />
        <i />
      </div>

      <div className="container-page relative pb-24">
        <HeroArt map={asleep ? null : activeMap} art={data.art} asleep={asleep} />
        <div className="grid gap-x-10 gap-y-10 min-[1280px]:grid-cols-[minmax(0,1fr)_360px] min-[1280px]:grid-rows-[auto_1fr]">
          <div className="order-1 min-w-0 min-[1280px]:col-start-1 min-[1280px]:row-start-1">
            {state === 'indisponivel' ? (
              <Unavailable onRetry={retry} />
            ) : (
              <Hero
                state={state}
                signedIn={signedIn}
                total={total}
                liveCount={liveServers.length}
                featured={featured}
                friendsNow={friendsNow}
                hasLoadout={hasLoadout}
                lastSeen={lastSeen}
                fromPath="/"
              />
            )}
          </div>

          {/* Abaixo de 1280 não há trilho: o Marquee leva a atividade numa faixa só (o feed fica no trilho). */}
          <div className="order-1 min-w-0 min-[1280px]:hidden">
            <ActivityStrip items={activity} />
          </div>

          {/* No celular o trilho se desfaz: os amigos vêm logo depois do hero (Jogar junto é a ação de maior valor); o top 3 depois dos servidores. */}
          <aside
            aria-label={t('rail')}
            className="contents min-[1280px]:col-start-2 min-[1280px]:row-span-2 min-[1280px]:row-start-1 min-[1280px]:grid min-[1280px]:content-start min-[1280px]:gap-4 min-[1280px]:pt-14"
          >
            <FriendsPanel
              servers={servers}
              friends={friends}
              className="order-2 min-[1280px]:order-none"
            />
            <FeedPanel
              items={activity}
              fresh={fresh}
              live={liveServers.length > 0}
              className="order-4 max-[1279px]:hidden min-[1280px]:order-none"
            />
            <TopPanel top={data.top} className="order-5 min-[1280px]:order-none" />
          </aside>

          <section
            id="jogar"
            aria-labelledby="home-servers"
            className="order-3 min-w-0 scroll-mt-20 min-[1280px]:col-start-1 min-[1280px]:row-start-2"
          >
            <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
              <h2 id="home-servers" className="v-title">
                {ts('title')}
              </h2>
              <LiveStatus state={live} />
            </div>
            <p className="mb-3 hidden rounded-md bg-(--fill-rest) px-3 py-2.5 text-body-sm text-muted-foreground pointer-coarse:block">
              {ts.rich('connect.mobileHint', { cmd })}
            </p>
            {state === 'indisponivel' ? null : servers.length === 0 ? (
              <EmptyState icon={ServerIcon} title={ts('empty.title')} body={ts('empty.body')} />
            ) : (
              <>
                {liveServers.length === 0 ? (
                  <p
                    role="status"
                    className="rounded-2xl bg-(--fill-rest) px-4 py-5 text-body text-muted-foreground"
                  >
                    {ts('empty.allOffline')}
                  </p>
                ) : (
                  <ul
                    aria-label={ts('listLabel')}
                    data-testid="server-list"
                    className="grid gap-4 min-[760px]:grid-cols-2"
                  >
                    {liveServers.map((server, i) => (
                      <ServerCard
                        key={server.id}
                        server={server}
                        art={server.map ? data.art[server.map] : undefined}
                        index={i}
                        solo={soloLive && i === 0}
                        friends={byServer.get(server.id) ?? []}
                        onFocusMap={setHoverMap}
                        className={cn(soloLive && i === 0 && 'col-span-full')}
                      />
                    ))}
                  </ul>
                )}
                <OfflineGroup
                  servers={offlineServers}
                  defaultOpen={offlineGroupOpen(liveServers.length, offlineServers.length)}
                  startIndex={liveServers.length}
                />
              </>
            )}
          </section>
        </div>

        <WeekStrip summary={data.week} />
        <InView fallback={<LoadoutsSkeleton />}>
          <LoadoutsWeek />
        </InView>
      </div>
    </div>
  );
}

/** Sem nenhum estado conhecido (a API não respondeu ao abrir a página): avisa, nunca mostra uma lista vazia. */
function Unavailable({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('servers.unavailable');
  return (
    <div className="pt-14 max-md:pt-9" data-testid="servers-unavailable">
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
