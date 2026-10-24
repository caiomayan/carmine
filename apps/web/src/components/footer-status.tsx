'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LiveCount } from '@/components/live-count';
import { StatusDot } from '@/components/status-dot';
import { WeekCountdown } from '@/components/vida/countdown';
import { LastEvent } from '@/components/vida/footer-fx';
import { isLive, type ServersSummary, useServersSummary } from '@/lib/servers';

/**
 * Faixa viva do rodapé (proto/vida): AO VIVO ou EM PAUSA com o resumo dos servidores (o lido no servidor e,
 * com a home aberta, o mesmo resumo ao vivo), a contagem até a virada da semana do Ranking, com os dígitos
 * rolando, e o último evento do feed trocando com animação. Sem resposta da API não afirma "0 servidores":
 * diz que não sabe.
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
      className="v-panel v-panel-lg v-spot flex flex-wrap items-center gap-x-9 gap-y-4 bg-surface px-7 py-5 text-xs text-muted-foreground max-md:flex-col max-md:items-start max-md:gap-y-4 max-md:px-5"
    >
      <span className="v-label inline-flex items-center gap-2.5 text-foreground">
        <StatusDot tone={live ? 'online' : 'offline'} pulse={live} />
        <span className={live ? 'v-shine' : undefined}>
          {live ? t('live') : summary ? t('paused') : t('soon')}
        </span>
      </span>
      {summary ? (
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm">
          <span>
            {t.rich('servers', {
              count: summary.online,
              n: () => strong(<LiveCount value={summary.online} />),
            })}
          </span>
          <span aria-hidden="true" className="h-3 w-px bg-line-strong max-md:hidden" />
          <span>
            {t.rich('players', {
              count: summary.players,
              n: () => strong(<LiveCount value={summary.players} />),
            })}
          </span>
        </span>
      ) : (
        <span className="text-body-sm">{t('unavailable')}</span>
      )}
      <span className="inline-flex items-baseline gap-3 text-foreground max-md:w-full">
        <span className="text-caption whitespace-nowrap text-muted-foreground">Ranking vira em</span>
        <WeekCountdown className="text-[26px]" />
      </span>
      <LastEvent still={!live} />
    </div>
  );
}
