'use client';

import type { LiveServer } from '@carmine/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { type CSSProperties, type ReactNode, useId, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/animate-ui/components/radix/tooltip';
import { CheckIcon } from '@/components/icons/animated/check';
import { CopyIcon } from '@/components/icons/animated/copy';
import { MapPinIcon } from '@/components/icons/animated/map-pin';
import { XIcon } from '@/components/icons/animated/x';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { LiveCount } from '@/components/live-count';
import { SERVER_GRID } from '@/components/servers/server-list';
import { StatusDot, type StatusTone } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { occupancy, steamConnectUrl } from '@/lib/live-servers';
import { cn } from '@/lib/utils';
import { useCopy } from './use-copy';

const STATE_TONE: Record<LiveServer['state'], StatusTone> = {
  online: 'online',
  full: 'warn',
  offline: 'offline',
};

/** Trecho de comando de console, no mesmo desenho do `!ws` do Loadout. */
export const cmd = (chunks: ReactNode) => (
  <code className="rounded-sm bg-surface-2 px-1 py-px font-semibold whitespace-nowrap text-foreground">
    {chunks}
  </code>
);

/**
 * Uma linha da lista ao vivo (S06). Conectar abre o `steam://connect` e, logo abaixo, abre a
 * instrução do console com o IP copiável (para quando o `steam://` não abre). Num aparelho de
 * toque não há CS2: a linha mostra só o IP para copiar; a instrução de abrir no PC fica no
 * alto da lista. Offline desabilita Conectar.
 */
export function ServerRow({ server, index }: { server: LiveServer; index: number }) {
  const t = useTranslations('servers');
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const [help, setHelp] = useState<'closed' | 'connect' | 'copy'>('closed');
  const { status: copyStatus, copy } = useCopy();
  const helpId = useId();
  const offline = server.state === 'offline';
  const { ratio, level } = occupancy(server);

  const copyAddress = async () => {
    await copy(server.address);
    setHelp((current) => (current === 'closed' ? 'copy' : current));
  };

  const seen = server.lastHeartbeatAt
    ? t('row.seen', { ago: format.relativeTime(new Date(server.lastHeartbeatAt), now) })
    : t('row.neverSeen');

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
            <h3
              className={cn(
                'truncate text-[14.5px] font-semibold',
                offline && 'text-muted-foreground',
              )}
            >
              {server.name}
            </h3>
          </div>
          <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
            <AnimatedIcon icon={MapPinIcon} size={13} />
            <span className="shrink-0">{t(`regions.${server.region}`)}</span>
            <span aria-hidden="true">·</span>
            <span data-testid="server-address" className="truncate tabular-nums select-all">
              {server.address}
            </span>
          </p>
        </div>

        <div className="grid min-w-0 gap-0.5 [grid-area:map] md:[grid-area:auto]">
          <span
            className={cn(
              'truncate text-[13.5px] font-semibold',
              offline && 'font-medium text-muted-foreground',
            )}
          >
            {server.map ?? t('row.noMap')}
          </span>
          <span className="truncate text-[12px] text-muted-foreground" suppressHydrationWarning>
            {offline ? seen : t('row.currentMap')}
          </span>
        </div>

        <div className="grid min-w-0 content-center gap-2 [grid-area:players] md:[grid-area:auto]">
          <span className="sr-only">
            {t('row.players', { players: server.players, max: server.maxPlayers })}
          </span>
          <span
            aria-hidden="true"
            data-testid="server-players"
            className={cn(
              'text-[13.5px] tabular-nums',
              offline ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            <LiveCount value={server.players} className="font-semibold" />
            <span className="text-muted-foreground">/{server.maxPlayers}</span>
          </span>
          <span aria-hidden="true" className="block h-[3px] overflow-hidden rounded-[2px] bg-line">
            <span
              className={cn(
                'block h-full origin-left rounded-[2px] transition-[transform,background-color] duration-(--dur-slow) ease-out motion-reduce:transition-none',
                level === 'full'
                  ? 'bg-[repeating-linear-gradient(-45deg,var(--status-warn)_0_3px,color-mix(in_srgb,var(--status-warn)_35%,transparent)_3px_6px)]'
                  : level === 'high'
                    ? 'bg-status-warn'
                    : 'bg-status-online',
              )}
              style={{ transform: `scaleX(${ratio})` }}
            />
          </span>
        </div>

        <div className="flex items-center gap-2 self-center text-[12.5px] [grid-area:state] md:[grid-area:auto]">
          <StatusDot tone={STATE_TONE[server.state]} pulse={server.state === 'online'} />
          <span className={cn(offline ? 'text-muted-foreground' : 'text-foreground')}>
            {t(`states.${server.state}`)}
          </span>
        </div>

        <div className="flex items-center justify-end gap-1 [grid-area:btn] md:[grid-area:auto]">
          {offline ? (
            <Button disabled className="pointer-coarse:hidden">
              {t('connect.button')}
            </Button>
          ) : (
            <>
              <Button asChild className="pointer-coarse:hidden">
                <a
                  href={steamConnectUrl(server.address)}
                  aria-label={t('connect.aria', { server: server.name })}
                  aria-describedby={help !== 'closed' ? helpId : undefined}
                  onClick={() => setHelp('connect')}
                >
                  {t('connect.button')}
                </a>
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('connect.copyAria', { server: server.name })}
                    onClick={copyAddress}
                    className="pointer-coarse:hidden"
                  >
                    <CopyGlyph copied={copyStatus === 'copied'} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {copyStatus === 'copied' ? t('connect.copied') : t('connect.copy')}
                </TooltipContent>
              </Tooltip>
              {/* No toque: só copiar o IP, com o texto dizendo o que faz. */}
              <Button
                variant="ghost"
                aria-label={t('connect.copyAria', { server: server.name })}
                onClick={copyAddress}
                className="hidden pointer-coarse:inline-flex"
              >
                <CopyGlyph copied={copyStatus === 'copied'} />
                {copyStatus === 'copied' ? t('connect.copied') : t('connect.copy')}
              </Button>
            </>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {help !== 'closed' && !offline ? (
          <motion.div
            key="help"
            data-help
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <ConnectHelp
              id={helpId}
              address={server.address}
              opening={help === 'connect'}
              full={server.state === 'full'}
              copyStatus={copyStatus}
              onCopy={copyAddress}
              onClose={() => setHelp('closed')}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function CopyGlyph({ copied }: { copied: boolean }) {
  return copied ? (
    <span className="text-status-success">
      <AnimatedIcon icon={CheckIcon} size={16} />
    </span>
  ) : (
    <AnimatedIcon icon={CopyIcon} size={16} />
  );
}

/** A instrução do console embaixo da linha: o que fazer se o `steam://` não abrir. */
function ConnectHelp({
  id,
  address,
  opening,
  full,
  copyStatus,
  onCopy,
  onClose,
}: {
  id: string;
  address: string;
  opening: boolean;
  full: boolean;
  copyStatus: ReturnType<typeof useCopy>['status'];
  onCopy: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('servers');
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 pb-3.5 md:flex-nowrap">
      <div id={id} role="status" className="min-w-0 flex-1 text-[13px] text-muted-foreground">
        {opening ? <span className="text-foreground">{t('connect.opening')} </span> : null}
        {t.rich('connect.hint', { address, cmd })}
        {full ? <span className="block pt-1">{t('row.fullHint')}</span> : null}
        {copyStatus === 'failed' ? (
          <span className="block pt-1 text-foreground">{t('connect.copyFailed')}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onCopy} data-testid="copy-command">
          <CopyGlyph copied={copyStatus === 'copied'} />
          {copyStatus === 'copied' ? t('connect.copied') : t('connect.copy')}
        </Button>
        <Button variant="quiet" size="icon" aria-label={t('connect.close')} onClick={onClose}>
          <AnimatedIcon icon={XIcon} size={16} />
        </Button>
      </div>
    </div>
  );
}
