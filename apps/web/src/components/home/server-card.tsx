'use client';

import type { LiveServer, PlayingFriend } from '@carmine/contracts';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { type CSSProperties, useMemo } from 'react';
import { ConnectHelp, useConnect } from '@/components/servers/connect';
import { StatusDot } from '@/components/status-dot';
import type { ArtPair } from '@/components/vida/map-art';
import { MapPicture, useArtChoice } from '@/components/vida/map-picture';
import { Ticker } from '@/components/vida/ticker';
import { mapVars } from '@/lib/home/map-colors';
import { isLiveServer } from '@/lib/home/state';
import { serverAnchor, serverFullLabel, serverLabel, steamConnectUrl } from '@/lib/live-servers';
import { mapDisplayName, mapSlug } from '@/lib/map-art';
import { cn } from '@/lib/utils';
import { DynamicButton } from './dynamic-button';
import { PlayerAvatar } from './player-avatar';

/** Quantos avatares de amigo cabem empilhados no cartão. */
const FRIEND_FACES = 3;

/**
 * Cartão de servidor, de tela de loading: a arte do mapa colorida, o nome do mapa em display condensado, a cor do
 * mapa no selo do Modo e na barra, jogadores com contagem, amigos que estão lá e os botões (Conectar, que abre o
 * `steam://connect`, e Copiar IP, que também abre a instrução do console). O offline é um cartão compacto, sem
 * arte (o servidor sem batimento não tem mapa), com o motivo por extenso e sem botão de jogar.
 */
export function ServerCard({
  server,
  art,
  index,
  solo,
  friends,
  onFocusMap,
  className,
}: {
  server: LiveServer;
  art: ArtPair | undefined;
  index: number;
  solo?: boolean;
  friends: PlayingFriend[];
  /** O mapa em foco (hover ou foco) muda a arte do topo e a cor ambiente da Home. */
  onFocusMap?: (map: string | null) => void;
  className?: string;
}) {
  const t = useTranslations('servers');
  const live = isLiveServer(server);
  const full = server.state === 'full';
  const connect = useConnect(server);
  const choice = useArtChoice(live ? art : undefined);
  const vars = useMemo(() => mapVars(choice?.colors), [choice]);
  const mapName = mapDisplayName(server.map);
  const slug = mapSlug(server.map);
  const fill = Math.min(1, server.players / server.maxPlayers);
  const fullLabel = serverFullLabel(server);
  const style = { ...vars, '--i': index } as CSSProperties;

  return (
    <li
      id={serverAnchor(server.id)}
      data-testid="server-card"
      data-server={server.name}
      data-state={server.state}
      data-map={live ? (server.map ?? undefined) : undefined}
      style={style}
      onPointerEnter={() => live && onFocusMap?.(slug)}
      onPointerLeave={() => live && onFocusMap?.(null)}
      onFocus={() => live && onFocusMap?.(slug)}
      onBlur={() => live && onFocusMap?.(null)}
      className={cn(
        'vh-card v-card v-spot v-panel v-panel-lg enter-stagger relative flex list-none scroll-mt-24 flex-col overflow-hidden',
        live ? 'min-h-[320px]' : 'vh-offline min-h-[184px]',
        // Com arte, o cartão não tem fundo próprio por baixo da imagem (a borda da imagem escalada deixaria um filete).
        live && art && 'vh-card-art',
        solo && 'min-[1280px]:min-h-[360px]',
        className,
      )}
    >
      {live && art ? (
        <>
          <MapPicture
            map={slug ?? ''}
            art={art}
            priority={index < 2}
            sizes="(min-width: 1280px) 440px, (min-width: 760px) 50vw, 100vw"
            className="absolute -inset-px z-0"
            imgClassName="vh-map-img"
          />
          <span aria-hidden="true" className="vh-wash" />
        </>
      ) : (
        <span aria-hidden="true" className="vh-wash" />
      )}

      <div className="relative z-10 flex flex-1 flex-col gap-5 p-5 max-md:p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="vh-chip">{t(`modes.${server.mode}`)}</span>
          <span className="inline-flex items-center gap-2 rounded-sm bg-(--bg)/85 px-3 py-[6px] text-caption font-semibold text-foreground">
            <StatusDot tone={live ? (full ? 'warn' : 'online') : 'offline'} pulse={live && !full} />
            {live ? (full ? t('states.full') : t('live.live')) : t('states.offline')}
          </span>
        </div>

        <div className="mt-auto grid gap-3">
          <div className="grid gap-1">
            {live ? (
              <p
                className={cn(
                  'v-sign text-[64px] max-md:text-[52px]',
                  solo && 'min-[1280px]:text-[84px]',
                )}
              >
                {mapName ?? t('row.noMap')}
              </p>
            ) : null}
            <h3
              className={cn(
                'leading-tight tracking-[-0.02em]',
                live
                  ? cn('text-[20px] font-bold', solo && 'min-[1280px]:text-[24px]')
                  : 'v-sign text-[40px]',
              )}
            >
              {serverLabel(server)}
            </h3>
            <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-(--on-map-muted)">
              {server.code ? (
                <span data-testid="server-code" className="tabular-nums">
                  {server.code}
                </span>
              ) : null}
              {!live ? <OfflineSince server={server} /> : null}
            </p>
          </div>

          {live ? (
            <div className="grid gap-2">
              <span className="sr-only">
                {t('row.players', { players: server.players, max: server.maxPlayers })}
              </span>
              <div aria-hidden="true" className="flex items-end justify-between gap-3">
                <span className="flex items-baseline gap-1.5">
                  <Ticker
                    value={server.players}
                    className="text-[44px] leading-none font-bold tracking-[-0.03em] text-foreground max-md:text-[38px]"
                  />
                  <span className="text-[24px] font-semibold text-(--on-map-muted)">
                    /{server.maxPlayers}
                  </span>
                  <span className="pl-1 text-body-sm text-(--on-map-muted)">
                    {t('card.playersUnit')}
                  </span>
                </span>
              </div>
              <div className="vh-bar" aria-hidden="true">
                <span style={{ transform: `scaleX(${fill})` }} />
              </div>
              {full ? (
                <p className="text-caption text-(--on-map-muted)">{t('card.fullNote')}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 max-md:flex-col max-md:items-stretch">
            {friends.length > 0 ? (
              <span data-testid="card-friends" className="flex min-w-0 items-center gap-2.5">
                <ul
                  aria-label={t('card.friendsAria', { server: fullLabel })}
                  className="flex -space-x-2"
                >
                  {friends.slice(0, FRIEND_FACES).map((friend) => (
                    <li key={friend.steamId} className="rounded-full bg-background p-[2px]">
                      <PlayerAvatar
                        src={friend.avatarUrl}
                        name={friend.displayName}
                        size={28}
                        alt={friend.displayName}
                      />
                    </li>
                  ))}
                </ul>
                <span className="min-w-0 truncate text-body-sm font-medium text-foreground">
                  {t('card.friendsHere', {
                    name: friends[0]?.displayName ?? '',
                    others: friends.length - 1,
                  })}
                </span>
              </span>
            ) : null}
            {live ? (
              <span className="ml-auto flex flex-wrap items-center gap-2 max-md:ml-0 max-md:[&>*]:flex-1">
                <DynamicButton
                  variant="quiet"
                  idle={t('connect.copy')}
                  loading={t('connect.copying')}
                  done={t('connect.copied')}
                  ariaLabel={t('connect.copyAria', { server: fullLabel })}
                  loadingMs={650}
                  doneMs={1800}
                  onAction={connect.copyAddress}
                  testId="copy-ip"
                />
                <DynamicButton
                  idle={t('connect.button')}
                  loading={t('connect.opening')}
                  href={steamConnectUrl(server.address)}
                  ariaLabel={t('connect.aria', { server: fullLabel })}
                  describedBy={connect.help !== 'closed' ? connect.helpId : undefined}
                  onAction={() => {
                    connect.opening();
                    return undefined;
                  }}
                  className="pointer-coarse:hidden"
                  testId="connect"
                />
              </span>
            ) : null}
          </div>
          {live ? <ConnectHelp server={server} connect={connect} showFullHint={false} /> : null}
        </div>
      </div>
    </li>
  );
}

/** "Offline há 25 min" (relido a cada minuto) ou "Nunca ficou online". */
function OfflineSince({ server }: { server: LiveServer }) {
  const t = useTranslations('servers.offline');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  if (!server.lastHeartbeatAt) return <span>{t('never')}</span>;
  // O "há N s" muda entre o servidor e a hidratação: o texto é corrigido no próximo minuto.
  return (
    <span suppressHydrationWarning>
      {t('since', { ago: format.relativeTime(new Date(server.lastHeartbeatAt), now) })}
    </span>
  );
}
