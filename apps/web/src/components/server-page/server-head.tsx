'use client';

import type { LiveServer } from '@carmine/contracts';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { DynamicButton } from '@/components/home/dynamic-button';
import { ConnectHelp, useConnect } from '@/components/servers/connect';
import { StatusDot } from '@/components/status-dot';
import { serverLabel, steamConnectUrl } from '@/lib/live-servers';
import type { ServerPhase } from '@/lib/server-page/view';

/**
 * O topo da página: voltar, o selo de estado e o Modo, o nome do mapa em Big Shoulders (o do ar, ou o último que o
 * servidor parado informou), o nome do servidor e as ações (Jogar, que abre o `steam://connect`, e Copiar IP, que
 * também abre a instrução do console). O servidor offline não tem ação: só o motivo, por extenso.
 */
export function ServerHead({
  server,
  phase,
  mapName,
  modeLabel,
}: {
  server: LiveServer;
  phase: ServerPhase;
  /** O mapa grande: nulo quando o servidor nunca informou um (o nome do servidor ocupa o lugar). */
  mapName: string | null;
  modeLabel: string;
}) {
  const t = useTranslations('serverPage');
  const ts = useTranslations('servers');
  const connect = useConnect(server);
  const live = phase !== 'offline';
  const label = serverLabel(server);

  return (
    <div className="vs-head">
      <Link href="/" className="vs-back">
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 3 5 8l5 5" />
        </svg>
        {t('back')}
      </Link>

      <p className="vs-meta">
        <span className="vs-status">
          <StatusDot
            tone={live ? (phase === 'live' ? 'online' : 'warn') : 'offline'}
            pulse={phase === 'live'}
          />
          {t(`status.${phase}`)}
        </span>
        <span className="vs-chip">{modeLabel}</span>
      </p>

      {mapName ? (
        <p className="vs-map v-sign" data-testid="server-map">
          {!live ? <span className="sr-only">{t('lastMap')}: </span> : null}
          {mapName}
        </p>
      ) : null}
      <h1 className="vs-name" data-big={mapName ? undefined : ''}>
        {label}
      </h1>

      {live ? (
        <>
          <div className="vs-connect">
            <DynamicButton
              idle={ts('connect.button')}
              loading={ts('connect.opening')}
              href={steamConnectUrl(server.address)}
              ariaLabel={ts('connect.aria', { server: label })}
              describedBy={connect.help !== 'closed' ? connect.helpId : undefined}
              onAction={() => {
                connect.opening();
                return undefined;
              }}
              className="pointer-coarse:hidden"
              testId="connect"
            />
            <DynamicButton
              variant="quiet"
              idle={ts('connect.copy')}
              loading={ts('connect.copying')}
              done={ts('connect.copied')}
              ariaLabel={ts('connect.copyAria', { server: label })}
              loadingMs={650}
              doneMs={1800}
              onAction={connect.copyAddress}
              testId="copy-ip"
            />
            <span className="vs-address">
              <span className="v-label">{t('address')}</span>
              <span className="tabular-nums" data-testid="server-address">
                {server.address}
              </span>
            </span>
          </div>
          <ConnectHelp server={server} connect={connect} showFullHint={false} />
          {phase === 'full' ? <p className="vs-note">{ts('row.fullHint')}</p> : null}
        </>
      ) : (
        <>
          <OfflineSince server={server} mapName={mapName} />
          <p className="vs-note">{t('offline.note')}</p>
        </>
      )}
    </div>
  );
}

/** "Offline há 25 min · último mapa Mirage" (relido a cada minuto) ou "Nunca ficou online". */
function OfflineSince({ server, mapName }: { server: LiveServer; mapName: string | null }) {
  const t = useTranslations('serverPage.offline');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  if (!server.lastHeartbeatAt) {
    return (
      <p className="vs-sub" data-testid="offline-since">
        <span>{t('never')}</span>
      </p>
    );
  }
  const ago = format.relativeTime(new Date(server.lastHeartbeatAt), now);
  // O "há N min" muda entre o servidor e a hidratação: o texto é corrigido no próximo minuto.
  return (
    <p className="vs-sub" data-testid="offline-since">
      <span suppressHydrationWarning>
        {mapName && server.lastMap ? t('sinceMap', { ago, map: mapName }) : t('since', { ago })}
      </span>
    </p>
  );
}
