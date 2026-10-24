'use client';

import type { CSSProperties } from 'react';
import { StatusDot } from '@/components/status-dot';
import { cn } from '@/lib/utils';
import { type DemoServer, isLive, MAP_NAMES, PEOPLE } from './data';
import { DynamicButton } from './dynamic-button';
import { Face } from './face';
import { MapPicture } from './map-art';
import { Ticker } from './ticker';

const MODE_LABEL = { retake: 'Retake', deathmatch: 'Deathmatch' } as const;

/**
 * Painel de servidor, de tela de loading: a arte do mapa colorida em tamanho grande, o nome em display
 * condensado, a cor do mapa na etiqueta e na barra, jogadores com contagem, lados CT/TR no Retake, amigos
 * que estão lá e os botões dinâmicos (Conectar e Copiar IP). Offline também é painel, com "último jogo há
 * X" e o mapa, em vez de uma linha de texto.
 */
export function ServerCard({
  server,
  index,
  solo,
  onFocusMap,
  className,
}: {
  server: DemoServer;
  index: number;
  solo?: boolean;
  onFocusMap?: (map: DemoServer['map'] | null) => void;
  className?: string;
}) {
  const live = isLive(server);
  const full = live && server.players >= server.max;
  const fill = Math.min(1, server.players / server.max);
  const address = `${server.id}.carmine.gg:27015`;
  return (
    <li
      data-map={server.map}
      data-state={live ? (full ? 'full' : 'online') : 'offline'}
      data-testid="vida-server"
      style={{ '--i': index } as CSSProperties}
      onPointerEnter={() => onFocusMap?.(server.map)}
      onPointerLeave={() => onFocusMap?.(null)}
      onFocus={() => onFocusMap?.(server.map)}
      onBlur={() => onFocusMap?.(null)}
      className={cn(
        'v-card v-spot v-panel enter-stagger relative flex list-none flex-col overflow-hidden',
        live ? 'min-h-[320px]' : 'min-h-[184px]',
        solo && 'min-[1280px]:min-h-[360px]',
        !live && 'v-offline',
        className,
      )}
    >
      <MapPicture
        map={server.map}
        priority={index < 2}
        sizes="(min-width: 1280px) 440px, (min-width: 760px) 50vw, 100vw"
        className="absolute inset-0 z-0"
        imgClassName="v-map-img"
      />
      <span aria-hidden="true" className="v-card-wash" />

      <div className="relative z-10 flex flex-1 flex-col gap-5 p-5 max-md:p-4">
        <div className="flex items-start justify-between gap-3">
          <span className="v-chip-map">{MODE_LABEL[server.mode]}</span>
          <span className="inline-flex items-center gap-2 rounded-sm bg-(--bg)/85 px-2.5 py-[6px] text-caption font-semibold text-foreground">
            <StatusDot tone={live ? 'online' : 'offline'} pulse={live && !full} />
            {live ? (full ? 'Lotado' : 'Ao vivo') : 'Offline'}
          </span>
        </div>

        <div className="mt-auto grid gap-3">
          <div className="grid gap-1">
            <p className={cn(live ? 'v-sign text-[64px] max-md:text-[52px]' : 'v-sign text-[40px]', solo && 'min-[1280px]:text-[84px]')}>
              {MAP_NAMES[server.map]}
            </p>
            <h3 className={cn('text-[20px] leading-tight font-bold tracking-[-0.02em]', solo && 'min-[1280px]:text-[24px]')}>
              {server.name}
            </h3>
            <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-(--on-map-muted)">
              <span className="tabular-nums">{server.code}</span>
              {!live && server.lastGame ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Último jogo {server.lastGame}</span>
                </>
              ) : null}
            </p>
          </div>

          {live ? (
            <div className="grid gap-2">
              <div className="flex items-end justify-between gap-3">
                <span className="flex items-baseline gap-1.5">
                  <Ticker
                    value={server.players}
                    className="text-[44px] leading-none font-bold tracking-[-0.03em] text-foreground max-md:text-[38px]"
                  />
                  <span className="text-[24px] font-semibold text-(--on-map-muted)">/{server.max}</span>
                  <span className="pl-1 text-body-sm text-(--on-map-muted)">jogadores</span>
                </span>
                {server.mode === 'retake' && server.ct !== undefined ? (
                  <span className="flex items-center gap-3 pb-1.5 text-[13px] font-bold">
                    <span className="inline-flex items-center gap-1.5 text-side-ct">
                      <span aria-hidden="true" className="size-2.5 rounded-full bg-side-ct" />
                      CT {server.ct}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-side-t">
                      <span aria-hidden="true" className="size-2.5 rounded-full bg-side-t" />
                      TR {server.t}
                    </span>
                  </span>
                ) : null}
              </div>
              <div className="v-bar">
                <span style={{ transform: `scaleX(${fill})` }} />
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 max-md:flex-col max-md:items-stretch">
            {server.friends.length > 0 ? (
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex -space-x-2">
                  {server.friends.map((id) => (
                    <span key={id} className="rounded-full ring-2 ring-(--bg)">
                      <Face name={PEOPLE[id]?.name ?? id} hue={PEOPLE[id]?.hue ?? 0} size={30} />
                    </span>
                  ))}
                </span>
                <span className="min-w-0 truncate text-body-sm font-medium text-foreground">
                  {server.friends.length === 1
                    ? `${PEOPLE[server.friends[0] ?? '']?.name} está aqui`
                    : `${PEOPLE[server.friends[0] ?? '']?.name} e +${server.friends.length - 1} estão aqui`}
                </span>
              </span>
            ) : null}
            <span className="ml-auto flex flex-wrap items-center gap-2 max-md:ml-0 max-md:[&>*]:flex-1">
              {live ? (
                <>
                  <DynamicButton
                    variant="quiet"
                    idle="Copiar IP"
                    loading="Copiando"
                    done="Copiado"
                    copyText={address}
                    loadingMs={650}
                    doneMs={1800}
                    testId="vida-copy"
                  />
                  <DynamicButton
                    idle={full ? 'Entrar na fila' : 'Conectar'}
                    loading="Conectando"
                    done="Conectado"
                    testId="vida-connect"
                  />
                </>
              ) : (
                <a href="https://discord.gg/" className="v-cta-quiet">
                  Chamar no Discord
                </a>
              )}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}
