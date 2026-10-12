'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MapPinIcon } from '@/components/icons/animated/map-pin';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { LiveCount } from '@/components/live-count';
import { StatusDot } from '@/components/status-dot';
import { isLive, type ServersSummary, useServersSummary } from '@/lib/servers';

const Sep = () => <span aria-hidden="true" className="h-3 w-px bg-line-strong max-md:hidden" />;

/**
 * Estado dos Servidores Carmine no rodapé: o resumo lido no servidor e, com a home aberta, o
 * mesmo resumo ao vivo. Sem resposta da API não afirma "0 servidores": diz que não sabe.
 */
export function FooterStatus({ initial }: { initial: ServersSummary | null }) {
  const t = useTranslations('shell.footer.status');
  const summary = useServersSummary(initial);
  const live = summary ? isLive(summary) : false;
  const strong = (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>;

  return (
    <div
      role="status"
      aria-label={t('label')}
      className="flex flex-wrap items-center gap-x-5.5 gap-y-1.5 rounded-lg bg-surface px-4.5 py-3.5 text-xs text-muted-foreground max-md:flex-col max-md:items-start max-md:gap-y-2.5"
    >
      <span className="inline-flex items-center gap-2 label-caps text-foreground">
        <StatusDot tone={live ? 'online' : 'offline'} pulse={live} />
        {live ? t('live') : t('soon')}
      </span>
      {summary ? (
        <>
          <span>
            {t.rich('servers', {
              count: summary.online,
              n: () => strong(<LiveCount value={summary.online} />),
            })}
          </span>
          <Sep />
          <span>
            {t.rich('players', {
              count: summary.players,
              n: () => strong(<LiveCount value={summary.players} />),
            })}
          </span>
        </>
      ) : (
        <span>{t('unavailable')}</span>
      )}
      <Sep />
      <span className="inline-flex items-center gap-1.5">
        <AnimatedIcon icon={MapPinIcon} size={13} />
        {t('region')}
      </span>
    </div>
  );
}
