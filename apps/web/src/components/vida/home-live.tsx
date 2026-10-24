'use client';

import dynamic from 'next/dynamic';
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { siSteam } from 'simple-icons';
import { BrandIcon } from '@/components/icons/brand-icon';
import { StatusDot } from '@/components/status-dot';
import { publishLiveSummary } from '@/lib/servers';
import { cn } from '@/lib/utils';
import {
  type DemoServer,
  type HomeState,
  isLive,
  type MapSlug,
  PEOPLE,
  type SkinInfo,
  serversFor,
  skinColors,
} from './data';
import { DynamicButton } from './dynamic-button';
import { setFooterMap } from './footer-fx';
import { MapPicture, mapPalette, useNight } from './map-art';
import { ActivityMarquee } from './marquee';
import { FeedPanel, FriendsPanel, TopPanel } from './rail';
import { ServerCard } from './server-card';
import { LoadoutsSkeleton } from './skeleton';
import { Ticker } from './ticker';
import { WeekStrip } from './week-strip';

const LoadoutsWeek = dynamic(() => import('./loadouts-week'), {
  ssr: false,
  loading: () => <LoadoutsSkeleton />,
});

/** O Item equipado da pessoa logada (Karambit | Degradê): de onde vem a cor ambiente. */
const EQUIPPED_SKIN = 1327;

/** Simula a Presença: a cada poucos segundos um servidor ganha ou perde um jogador. */
function useSimulated(base: DemoServer[], enabled: boolean): DemoServer[] {
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      const live = base.filter(isLive);
      const pick = live[Math.floor(Math.random() * live.length)];
      if (!pick) return;
      setOffsets((prev) => {
        const current = prev[pick.id] ?? 0;
        const step = Math.random() < 0.5 ? -1 : 1;
        const next = Math.max(-3, Math.min(pick.max - pick.players, current + step));
        return { ...prev, [pick.id]: next };
      });
    }, 5200);
    return () => clearInterval(timer);
  }, [base, enabled]);
  return useMemo(
    () =>
      base.map((s) => {
        if (!isLive(s)) return s;
        const players = Math.max(1, s.players + (offsets[s.id] ?? 0));
        const ct = s.mode === 'retake' ? Math.ceil(players / 2) : undefined;
        return { ...s, players, ct, t: ct === undefined ? undefined : players - ct };
      }),
    [base, offsets],
  );
}

/** A arte do hero: o mapa em foco, de borda a borda; ao trocar de mapa a nova arte entra por cima. */
function HeroArt({ map, asleep }: { map: MapSlug; asleep: boolean }) {
  const [layers, setLayers] = useState<{ map: MapSlug; id: number }[]>([{ map, id: 0 }]);
  const counter = useRef(0);
  useEffect(() => {
    setLayers((prev) => {
      if (prev[prev.length - 1]?.map === map) return prev;
      counter.current += 1;
      return [...prev.slice(-1), { map, id: counter.current }];
    });
    const timer = setTimeout(() => setLayers((prev) => prev.slice(-1)), 900);
    return () => clearTimeout(timer);
  }, [map]);
  return (
    <div aria-hidden="true" className="v-hero-art" data-testid="vida-hero-art">
      {layers.map((layer, i) => (
        <MapPicture
          key={layer.id}
          map={layer.map}
          priority={i === 0}
          sizes="100vw"
          className={i === 0 ? 'size-full' : 'absolute inset-0 size-full'}
          imgStyle={{
            animation: i > 0 ? 'v-art-in 700ms var(--ease-out) both' : undefined,
            filter: asleep ? 'grayscale(0.45) brightness(0.62)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function HomeLive({ state, skins }: { state: HomeState; skins: Record<number, SkinInfo> }) {
  const base = useMemo(() => serversFor(state), [state]);
  const servers = useSimulated(base, state !== 'offline');
  const liveServers = servers.filter(isLive);
  const offlineServers = servers.filter((s) => !isLive(s));
  const total = liveServers.reduce((n, s) => n + s.players, 0);
  const featured =
    [...liveServers].sort((a, b) => b.players - a.players)[0] ?? (servers[0] as DemoServer);
  const logged = state === 'amigos' || state === 'sem-nada' || state === 'offline';
  const personal = state === 'amigos' || state === 'sem-nada';
  const [hoverMap, setHoverMap] = useState<MapSlug | null>(null);
  const activeMap = hoverMap ?? featured.map;
  // Cor ambiente: a skin equipada (logado) ou o mapa em destaque (deslogado e offline); no hover, o mapa.
  const night = useNight();
  const [c1, c2, c3] = hoverMap
    ? mapPalette(hoverMap, night)
    : personal
      ? skinColors(EQUIPPED_SKIN)
      : mapPalette(featured.map, night);
  useEffect(() => setFooterMap(activeMap), [activeMap]);

  // O rodapé segue os mesmos dados da Home, em todos os estados (ao vivo, sem nada, deslogado e em pausa).
  useEffect(() => {
    publishLiveSummary({ online: liveServers.length, players: total } as Parameters<typeof publishLiveSummary>[0]);
  }, [liveServers.length, total]);

  const ordered = [...liveServers, ...offlineServers];
  const soloLive = liveServers.length === 1;

  return (
    <div
      data-vida="on"
      data-state={state}
      data-map={activeMap}
      style={{ '--amb-1': c1, '--amb-2': c2, '--amb-3': c3 } as CSSProperties}
    >
      <div aria-hidden="true" className="v-ambient">
        <i />
        <i />
        <i />
      </div>

      <div className="container-page relative pb-24">
        <HeroArt map={activeMap} asleep={liveServers.length === 0} />
        <div className="grid gap-x-10 gap-y-10 min-[1280px]:grid-cols-[minmax(0,1fr)_360px] min-[1280px]:grid-rows-[auto_1fr]">
          <div className="order-1 min-w-0 min-[1280px]:col-start-1 min-[1280px]:row-start-1">
            <Hero
              state={state}
              total={total}
              liveCount={liveServers.length}
              featured={featured}
              logged={logged}
            />
          </div>

          {/* Abaixo de 1280 não há trilho: o Marquee leva a atividade numa faixa só (o feed fica no trilho). */}
          <div className="order-1 min-w-0 min-[1280px]:hidden">
            <ActivityMarquee skins={skins} live={liveServers.length > 0} />
          </div>

          {/* No celular o trilho se desfaz: os amigos vêm logo depois do hero (Entrar junto é a ação de maior valor); a atividade e o top 3 depois dos servidores. */}
          <aside
            aria-label="Ao vivo"
            className="contents min-[1280px]:col-start-2 min-[1280px]:row-span-2 min-[1280px]:row-start-1 min-[1280px]:grid min-[1280px]:content-start min-[1280px]:gap-4 min-[1280px]:pt-14"
          >
            <FriendsPanel state={state} className="order-2 min-[1280px]:order-none" />
            <FeedPanel skins={skins} live={liveServers.length > 0} className="order-4 max-[1279px]:hidden min-[1280px]:order-none" />
            <TopPanel className="order-5 min-[1280px]:order-none" />
          </aside>

          <section id="jogar" aria-labelledby="vida-servidores" className="order-3 min-w-0 scroll-mt-20 min-[1280px]:col-start-1 min-[1280px]:row-start-2">
            <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
              <h2 id="vida-servidores" className="v-title">
                Servidores
              </h2>
              <p className="inline-flex items-center gap-2 text-body-sm text-muted-foreground">
                <StatusDot tone={liveServers.length ? 'online' : 'offline'} pulse={liveServers.length > 0} />
                <span>
                  <b className="font-semibold text-foreground tabular-nums">{liveServers.length}</b> no ar ·{' '}
                  {offlineServers.length} dormindo
                </span>
              </p>
            </div>
            <ul className={cn('grid gap-4', 'min-[760px]:grid-cols-2')}>
              {ordered.map((server, i) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  index={i}
                  solo={soloLive && i === 0}
                  onFocusMap={setHoverMap}
                  className={cn(soloLive && i === 0 && 'col-span-full')}
                />
              ))}
            </ul>
          </section>
        </div>

        <WeekStrip />
        <LoadoutsWeek skins={skins} />
      </div>
    </div>
  );
}

function Hero({
  state,
  total,
  liveCount,
  featured,
  logged,
}: {
  state: HomeState;
  total: number;
  liveCount: number;
  featured: DemoServer;
  logged: boolean;
}) {
  const asleep = liveCount === 0;
  const friend = PEOPLE.lia;
  const cta = !logged ? (
    <a href="#entrar" className="v-cta" data-testid="vida-cta">
      <BrandIcon icon={siSteam} size={19} />
      Entrar com a Steam
    </a>
  ) : asleep ? (
    <a href="https://discord.gg/" className="v-cta" data-testid="vida-cta">
      Chamar a galera no Discord
    </a>
  ) : (
    <DynamicButton idle="Jogar agora" loading="Conectando" done="Conectado" testId="vida-cta" />
  );
  const second = !logged ? (
    <a href="#jogar" className="v-cta-quiet">
      Ver os servidores
    </a>
  ) : (
    <a href="/loadout" className="v-cta-quiet">
      {state === 'sem-nada' ? 'Montar o meu Loadout' : 'Ver o meu Loadout'}
    </a>
  );

  return (
    <div className="pt-14 max-md:pt-9" data-testid="vida-hero">
      <p className="v-label inline-flex items-center gap-2.5 rounded-sm bg-(--bg)/70 px-3 py-2">
        <StatusDot tone={asleep ? 'offline' : 'online'} pulse={!asleep} />
        <span className={asleep ? 'text-muted-foreground' : 'v-shine'}>
          {asleep ? 'Em pausa' : 'Ao vivo'}
        </span>
        <span aria-hidden="true" className="h-3 w-px bg-(--line-strong) max-md:hidden" />
        <span className="v-sign text-[17px] text-muted-foreground">
          <span className="md:hidden">· </span>St. Carmine<span className="max-md:hidden"> · Servidores comunitários</span>
        </span>
      </p>

      {asleep ? (
        <h1 className="v-serif mt-5 max-w-[13ch] text-[clamp(54px,7.8vw,116px)] text-balance">
          Os servidores estão dormindo
        </h1>
      ) : (
        <h1 className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-1">
          <span className="v-serif text-[clamp(120px,16vw,220px)]" data-testid="vida-total">
            <Ticker value={total} />
          </span>
          <span className="pb-[1vw] text-[clamp(24px,2.7vw,38px)] leading-[1.05] font-semibold tracking-[-0.03em] max-md:pb-1">
            jogadores
            <br />
            no ar agora
          </span>
        </h1>
      )}

      <p className="mt-6 max-w-[52ch] text-md text-foreground/85">
        {asleep ? (
          <>
            O último jogo foi há 25 min, no Retake em Mirage. Chame um amigo no Discord: quando o primeiro
            entra, o servidor acorda sozinho.
          </>
        ) : state === 'amigos' ? (
          <>
            {liveCount} servidores no ar. <b className="font-semibold">{friend?.name}</b> e o Dudu estão no
            Retake em Mirage agora; dá para entrar junto.
          </>
        ) : state === 'sem-nada' ? (
          <>Um servidor no ar, tranquilo para entrar. Monte o seu Loadout e as suas skins aparecem no jogo.</>
        ) : (
          <>
            Retake e Deathmatch com skins de verdade no servidor. Entre com a Steam e o seu Loadout vai junto.
          </>
        )}
      </p>

      <div className="mt-7 flex flex-wrap items-center gap-3 max-md:flex-col max-md:items-stretch [&>*]:max-md:w-full">
        {cta}
        {second}
        {!asleep ? (
          <span className="pl-1 text-caption text-muted-foreground max-md:pl-0">
            Mais cheio agora: <b className="font-semibold text-foreground">{featured.name}</b>
          </span>
        ) : null}
      </div>
    </div>
  );
}
