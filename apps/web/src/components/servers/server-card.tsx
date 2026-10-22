'use client';

import type { LiveServer, PlayingFriend } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { Avatar } from '@/components/avatar';
import { LiveCount } from '@/components/live-count';
import { StatusDot } from '@/components/status-dot';
import { serverFullLabel, serverLabel } from '@/lib/live-servers';
import { mapArt, mapDisplayName } from '@/lib/map-art';
import { cn } from '@/lib/utils';
import { ConnectButtons, ConnectHelp, useConnect } from './connect';
import { OccupancyBar, STATE_TONE } from './occupancy-bar';

/** Quantos avatares de amigos aparecem empilhados; o resto vira "+N". */
const VISIBLE_AVATARS = 4;

/**
 * O mapa atual no fundo do cartão. As imagens são as da rotação (`public/maps`, geradas por
 * `scripts/maps.mjs`); sem imagem (mapa fora da rotação) o cartão fica no fundo neutro. É
 * decoração: o nome do mapa vem em texto. `priority` marca os cartões da primeira tela.
 */
function MapBackdrop({
  map,
  sizes,
  priority,
}: {
  map: string | null;
  sizes: string;
  priority: boolean;
}) {
  const art = mapArt(map);
  if (!art) return <span aria-hidden="true" className="map-neutral absolute -inset-px" />;
  return (
    <picture className="absolute -inset-px">
      <source type="image/avif" srcSet={art.avif} sizes={sizes} />
      <source type="image/webp" srcSet={art.webp} sizes={sizes} />
      <img
        src={art.src}
        alt=""
        width={art.width}
        height={art.height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'auto' : 'low'}
        decoding="async"
        className="map-art size-full object-cover"
      />
    </picture>
  );
}

/**
 * Cartão de servidor da home (U2): o mapa atual ao fundo, escurecido (no tema claro, encoberto)
 * pelo degradê da superfície até o texto passar no AA; Modo e estado no alto e, embaixo, nome,
 * mapa, jogadores/vagas, os amigos que estão lá e Jogar. Só servidores no ar ganham cartão.
 */
export function ServerCard({
  server,
  friends,
  index,
  solo,
  sizes,
  priority,
}: {
  server: LiveServer;
  friends: PlayingFriend[];
  index: number;
  /** Único servidor no ar: o cartão ocupa a largura toda e ganha mais altura. */
  solo: boolean;
  sizes: string;
  priority: boolean;
}) {
  const t = useTranslations('servers');
  const connect = useConnect(server);
  const mapName = mapDisplayName(server.map);
  const full = server.state === 'full';

  return (
    <li
      data-testid="server-card"
      data-server={server.name}
      data-state={server.state}
      data-map={server.map ?? ''}
      style={{ '--i': index } as CSSProperties}
      className={cn(
        'group/card relative isolate flex min-h-[264px] enter-stagger flex-col rounded-2xl',
        solo && 'md:min-h-[320px]',
      )}
    >
      {/*
        A imagem e o escurecido moram na MESMA camada, e é ela que recorta no canto arredondado:
        recortando em dois lugares (o cartão e a imagem escalada, que vira camada própria no zoom),
        a borda antialiased deixava o fundo e o anel do cartão aparecerem como um filete. O fundo
        da camada é só o que se vê enquanto a imagem carrega.
      */}
      <div aria-hidden="true" className="map-layer absolute inset-0 -z-10 bg-surface-2">
        <MapBackdrop map={server.map} sizes={sizes} priority={priority} />
        <span className={cn('map-scrim absolute -inset-px', solo && 'map-scrim-solo')} />
      </div>

      <div className="flex items-start justify-between gap-3 p-4 pb-0 md:p-5 md:pb-0">
        <span className="chip-solid label-caps">{t(`modes.${server.mode}`)}</span>
        <span className="chip-solid inline-flex items-center gap-2 text-caption font-medium">
          <StatusDot tone={STATE_TONE[server.state]} pulse={server.state === 'online'} />
          {t(`states.${server.state}`)}
        </span>
      </div>

      <div
        className={cn(
          'mt-auto grid gap-4 p-4 pt-10 md:p-5 md:pt-14',
          solo && 'md:max-w-[520px] md:pt-20',
        )}
      >
        <div className="grid gap-1">
          <h3 className={cn('text-[19px] leading-tight font-semibold', solo && 'md:text-[24px]')}>
            {serverLabel(server)}
          </h3>
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-(--on-map-muted)">
            {mapName ? (
              <span data-testid="server-map" className="font-medium text-foreground">
                {mapName}
              </span>
            ) : null}
            {mapName && server.code ? <span aria-hidden="true">·</span> : null}
            {server.code ? (
              <span
                data-testid="server-code"
                className="rounded-xs bg-surface-2 px-1 py-px text-[11px] font-semibold tracking-[0.02em] text-foreground tabular-nums"
              >
                {server.code}
              </span>
            ) : null}
          </p>
        </div>

        <div className="grid gap-2">
          <span className="sr-only">
            {t('row.players', { players: server.players, max: server.maxPlayers })}
          </span>
          <div className="flex items-baseline justify-between gap-3">
            <span
              aria-hidden="true"
              data-testid="server-players"
              className="text-[15px] text-foreground tabular-nums"
            >
              <LiveCount value={server.players} className="font-semibold" />
              <span className="text-(--on-map-muted)">/{server.maxPlayers}</span>
              <span className="pl-1.5 text-body-sm text-(--on-map-muted)">
                {t('card.playersUnit')}
              </span>
            </span>
            {full ? (
              <span className="text-right text-caption whitespace-nowrap text-(--on-map-muted)">
                {t('card.fullNote')}
              </span>
            ) : null}
          </div>
          <OccupancyBar server={server} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 max-md:flex-col max-md:items-stretch">
          <FriendsHere friends={friends} server={server} />
          <ConnectButtons
            server={server}
            connect={connect}
            className={solo ? undefined : 'md:ml-auto'}
          />
        </div>
      </div>

      <ConnectHelp
        server={server}
        connect={connect}
        showFullHint={false}
        className="border-t border-line bg-background px-4 py-3 md:px-5"
      />
    </li>
  );
}

/** Os amigos que estão neste servidor: avatares empilhados e uma linha com o nome. */
function FriendsHere({ friends, server }: { friends: PlayingFriend[]; server: LiveServer }) {
  const t = useTranslations('servers.card');
  const [first] = friends;
  if (!first) return null;
  const shown = friends.slice(0, VISIBLE_AVATARS);
  const extra = friends.length - shown.length;
  return (
    <div data-testid="card-friends" className="flex min-w-0 items-center gap-2.5">
      <ul
        aria-label={t('friendsAria', { server: serverFullLabel(server) })}
        className="flex shrink-0 items-center -space-x-2"
      >
        {shown.map((friend) => (
          <li key={friend.steamId} className="rounded-full ring-2 ring-background">
            <Avatar
              src={friend.avatarUrl}
              name={friend.displayName}
              alt={friend.displayName}
              size={28}
            />
          </li>
        ))}
        {extra > 0 ? (
          <li className="grid size-7 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-foreground ring-2 ring-background tabular-nums">
            +{extra}
          </li>
        ) : null}
      </ul>
      <span className="min-w-0 truncate text-body-sm text-foreground">
        {t('friendsHere', { name: first.displayName, others: friends.length - 1 })}
      </span>
    </div>
  );
}
