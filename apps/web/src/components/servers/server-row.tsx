'use client';

import type { LiveServer } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { MapPinIcon } from '@/components/icons/animated/map-pin';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { LiveCount } from '@/components/live-count';
import { SERVER_GRID } from '@/components/servers/server-list';
import { StatusDot } from '@/components/status-dot';
import { serverLabel } from '@/lib/live-servers';
import { mapDisplayName } from '@/lib/map-art';
import { cn } from '@/lib/utils';
import { ConnectButtons, ConnectHelp, useConnect } from './connect';
import { OccupancyBar, STATE_TONE } from './occupancy-bar';

/**
 * Uma linha da lista ao vivo, para quando há mais de 6 servidores no ar (acima disso a home
 * deixa de usar cartões). Jogar abre o `steam://connect` e, logo abaixo, a instrução do console
 * com o IP copiável (para quando o `steam://` não abre). Num aparelho de toque não há CS2: a
 * linha mostra só o IP para copiar; a instrução de abrir no PC fica no alto da lista. Os
 * offline não têm linha: vão para o grupo "Offline".
 */
export function ServerRow({ server, index }: { server: LiveServer; index: number }) {
  const t = useTranslations('servers');
  const connect = useConnect(server);

  return (
    <li
      data-testid="server-row"
      data-server={server.name}
      data-state={server.state}
      style={{ '--i': index } as CSSProperties}
      className="group/row mb-0.5 enter-stagger rounded-lg transition-colors duration-(--dur-fast) ease-std hover:bg-surface has-[[data-help]]:bg-surface"
    >
      <div
        className={cn(
          SERVER_GRID,
          'grid grid-cols-2 gap-x-4 gap-y-3 px-3 py-4 [grid-template-areas:"main_main""map_players""state_btn"] md:min-h-[68px] md:py-3 md:[grid-template-areas:none]',
        )}
      >
        <div className="grid min-w-0 gap-1.5 [grid-area:main] md:[grid-area:auto]">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="shrink-0 rounded-sm bg-surface-2 px-1.5 py-[3px] label-caps text-[9.5px] text-foreground">
              {t(`modes.${server.mode}`)}
            </span>
            <h3 className="truncate text-[14.5px] font-semibold">{serverLabel(server)}</h3>
          </div>
          <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <AnimatedIcon icon={MapPinIcon} size={13} />
            <span className="shrink-0">{t(`regions.${server.region}`)}</span>
            <span aria-hidden="true">·</span>
            <span data-testid="server-address" className="truncate tabular-nums select-all">
              {server.address}
            </span>
            {server.code ? (
              <span
                data-testid="server-code"
                className="shrink-0 rounded-xs bg-surface-2 px-1 py-px text-[11px] font-semibold tracking-[0.02em] text-foreground tabular-nums"
              >
                {server.code}
              </span>
            ) : null}
          </p>
        </div>

        <div className="grid min-w-0 gap-0.5 [grid-area:map] md:[grid-area:auto]">
          <span data-testid="server-map" className="truncate text-[13.5px] font-semibold">
            {mapDisplayName(server.map) ?? t('row.noMap')}
          </span>
          <span className="truncate text-[12px] text-muted-foreground">{t('row.currentMap')}</span>
        </div>

        <div className="grid min-w-0 content-center gap-2 [grid-area:players] md:[grid-area:auto]">
          <span className="sr-only">
            {t('row.players', { players: server.players, max: server.maxPlayers })}
          </span>
          <span
            aria-hidden="true"
            data-testid="server-players"
            className="text-[13.5px] text-foreground tabular-nums"
          >
            <LiveCount value={server.players} className="font-semibold" />
            <span className="text-muted-foreground">/{server.maxPlayers}</span>
          </span>
          <OccupancyBar server={server} />
        </div>

        <div className="flex items-center gap-2 self-center text-[12.5px] [grid-area:state] md:[grid-area:auto]">
          <StatusDot tone={STATE_TONE[server.state]} pulse={server.state === 'online'} />
          <span className="text-foreground">{t(`states.${server.state}`)}</span>
        </div>

        <ConnectButtons
          server={server}
          connect={connect}
          className="justify-end [grid-area:btn] md:[grid-area:auto]"
        />
      </div>

      <ConnectHelp server={server} connect={connect} showFullHint className="px-3 pb-3.5" />
    </li>
  );
}
