'use client';

import type { LiveServer } from '@carmine/contracts';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { type CSSProperties, useId, useState } from 'react';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { serverLabel } from '@/lib/live-servers';
import { cn } from '@/lib/utils';

/**
 * Os servidores offline, no fim da home, leves de propósito: sem cartão, sem imagem, sem botão
 * (um "Jogar" desabilitado só parece quebrado) e com o motivo por extenso. Com poucos ele já
 * nasce aberto; com muitos (resíduo de teste, manutenção) fica recolhido atrás de "Offline (n)".
 */
export function OfflineGroup({
  servers,
  defaultOpen,
}: {
  servers: LiveServer[];
  defaultOpen: boolean;
}) {
  const t = useTranslations('servers.offline');
  // Só a escolha da pessoa fica guardada: sem ela, o padrão acompanha a lista ao vivo.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? defaultOpen;
  const listId = useId();
  if (servers.length === 0) return null;

  return (
    <div data-testid="offline-group" className="pt-6">
      <Button
        variant="quiet"
        size="sm"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setChosen(!open)}
        className="-ml-3"
      >
        <span className="tabular-nums">{t('title', { count: servers.length })}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={cn(
            'size-3.5 transition-transform duration-(--dur-base) ease-out motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </Button>
      <ul id={listId} hidden={!open} aria-label={t('listLabel')} className="grid pt-1">
        {servers.map((server, i) => (
          <OfflineRow key={server.id} server={server} index={i} />
        ))}
      </ul>
    </div>
  );
}

function OfflineRow({ server, index }: { server: LiveServer; index: number }) {
  const t = useTranslations('servers');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const since = server.lastHeartbeatAt
    ? t('offline.since', { ago: format.relativeTime(new Date(server.lastHeartbeatAt), now) })
    : t('offline.never');

  return (
    <li
      data-testid="server-offline"
      data-server={server.name}
      data-state="offline"
      style={{ '--i': index } as CSSProperties}
      className="flex enter-stagger flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2.5 text-[13px] text-muted-foreground"
    >
      <span className="inline-flex items-center gap-2.5">
        <StatusDot tone="offline" />
        <span className="font-medium">{serverLabel(server)}</span>
      </span>
      <span className="rounded-sm bg-surface px-1.5 py-[3px] label-caps text-[9.5px]">
        {t(`modes.${server.mode}`)}
      </span>
      <span suppressHydrationWarning>{since}</span>
    </li>
  );
}
