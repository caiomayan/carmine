'use client';

import type { LiveServer } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { type CSSProperties, useMemo } from 'react';
import { type ArtPair, choicePalette } from '@/components/vida/map-art';
import { MapPicture, useArtChoice } from '@/components/vida/map-picture';
import { mapVars } from '@/lib/home/map-colors';
import { sleepingArt } from '@/lib/home/offline-art';
import { mapDisplayName, mapSlug } from '@/lib/map-art';
import type { ServerExtras } from '@/lib/server-page/types';
import { serverPhase } from '@/lib/server-page/view';
import { CollectingBlock } from './collecting-block';
import { RosterSection } from './roster';
import {
  EmptyCard,
  LeaderCard,
  LiveScoreCard,
  OfflineCard,
  SlotsCard,
  WarmupCard,
} from './score-cards';
import { ServerHead } from './server-head';
import { TodaySection } from './today-panel';
import '@/components/home/home.css';
import './server-page.css';

/**
 * A página do servidor (/servidores/[id]), na linguagem Vida: o mapa de borda a borda com a cor dele, o nome e as
 * ações, o placar ao vivo CT × TR (Retake) ou o líder (Deathmatch), os jogadores e o histórico do dia. Só apresenta:
 * o `LiveServer` (estado, mapa, vagas, endereço) vem da lista ao vivo e os blocos da S12b chegam em `extras`, cada um
 * "coletando" ou pronto. Quem liga os dados é o `ServerPageLive`.
 */
export function ServerPageView({
  server,
  extras,
  art,
}: {
  server: LiveServer;
  extras: ServerExtras;
  art: Record<string, ArtPair>;
}) {
  const t = useTranslations('servers.modes');
  const match = extras.match.status === 'ready' ? extras.match.data : null;
  const phase = serverPhase(server, match);
  const live = phase !== 'offline';
  const dm = server.mode === 'deathmatch';
  const warmup = phase === 'warmup';
  const shownMap = live ? server.map : server.lastMap;

  // A arte: o mapa do ar; o servidor parado mostra a do último mapa, ou a de reserva do Modo (só estética).
  const sleeping = live ? null : sleepingArt(server, art);
  const slug = live ? mapSlug(server.map) : (sleeping?.slug ?? null);
  const pair = live ? (slug ? art[slug] : undefined) : sleeping?.art;
  const choice = useArtChoice(pair);
  const vars = useMemo(() => mapVars(choice?.colors), [choice]);
  const ambient = live && choice ? choicePalette(choice) : null;

  return (
    <div
      data-vida="on"
      data-testid="server-page"
      data-estado={phase}
      data-map={live ? (slug ?? undefined) : undefined}
      style={
        {
          ...vars,
          ...(ambient
            ? { '--amb-1': ambient[0], '--amb-2': ambient[1], '--amb-3': ambient[2] }
            : {}),
        } as CSSProperties
      }
    >
      <div aria-hidden="true" className="v-ambient">
        <i />
        <i />
        <i />
      </div>

      <div className="container-page relative pb-24">
        {pair && slug ? (
          <div aria-hidden="true" className="vs-art" data-asleep={!live || undefined}>
            <MapPicture map={slug} art={pair} priority sizes="100vw" className="size-full" />
          </div>
        ) : null}

        <div className="vs-hero">
          <ServerHead
            server={server}
            phase={phase}
            mapName={mapDisplayName(shownMap)}
            modeLabel={t(server.mode)}
          />
          <HeroSlot
            server={server}
            phase={phase}
            dm={dm}
            extras={extras}
            modeLabel={t(server.mode)}
          />
        </div>

        <RosterSection server={server} roster={extras.roster} warmup={warmup} />
        <TodaySection today={extras.today} live={live} dm={dm} art={art} />
      </div>
    </div>
  );
}

/** O cartão de vidro ao lado do nome: o certo para o estado (e para o que a API já entregou). */
function HeroSlot({
  server,
  phase,
  dm,
  extras,
  modeLabel,
}: {
  server: LiveServer;
  phase: ReturnType<typeof serverPhase>;
  dm: boolean;
  extras: ServerExtras;
  modeLabel: string;
}) {
  const today = extras.today.status === 'ready' ? extras.today.data : null;
  if (phase === 'offline') return <OfflineCard server={server} today={today} />;

  if (dm) {
    if (extras.roster.status === 'collecting') {
      return <CollectingBlock kind="leader" since={extras.roster.since} hero />;
    }
    return extras.roster.data.length === 0 ? (
      <EmptyCard server={server} modeLabel={modeLabel} />
    ) : (
      <LeaderCard players={extras.roster.data} today={today} server={server} />
    );
  }

  if (extras.match.status === 'collecting') {
    return <CollectingBlock kind="score" since={extras.match.since} hero />;
  }
  const match = extras.match.data;
  if (match?.warmup) return <WarmupCard server={server} />;
  if (match) return <LiveScoreCard match={match} server={server} />;
  return server.players === 0 ? (
    <EmptyCard server={server} modeLabel={modeLabel} />
  ) : (
    <SlotsCard server={server} />
  );
}
