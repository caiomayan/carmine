'use client';

import { APPEAL_PATH, APPEAL_RESPONSE_HOURS } from '@carmine/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { siDiscord } from 'simple-icons';
import { BadgeAlertIcon } from '@/components/icons/animated/badge-alert';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { BrandIcon } from '@/components/icons/brand-icon';
import { useSession } from '@/components/session/session-provider';
import { Button } from '@/components/ui/button';
import { activeBadges, untilKind } from '@/lib/moderation';
import { DISCORD_URL } from '@/lib/social';

/**
 * Aviso no alto do site para a própria Conta punida (S07): o que vale, o motivo (a Categoria e
 * o texto da Staff, que só a própria pessoa vê), até quando e como recorrer pelo Discord.
 * Sóbrio: a cor de erro fica só no ícone; o texto é neutro.
 */
export function SanctionNotice() {
  const { sanctions } = useSession();
  const t = useTranslations('moderation');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const shown = activeBadges(sanctions);
  if (shown.length === 0) return null;
  const banned = shown.some((s) => s.type === 'ban');

  return (
    <aside
      aria-labelledby="punicao-titulo"
      data-testid="sanction-notice"
      data-icon-trigger
      className="container-page animate-fade-up pt-5"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-3 rounded-xl bg-surface px-5 py-4 max-md:px-4">
        <span className="mt-0.5 grid size-8 place-items-center rounded-full bg-surface-2 text-status-danger">
          <AnimatedIcon icon={BadgeAlertIcon} size={16} />
        </span>
        <div className="grid min-w-0 gap-3">
          <h2 id="punicao-titulo" className="sr-only">
            {t('notice.label')}
          </h2>
          <ul className="grid gap-3">
            {shown.map((sanction) => {
              const kind = untilKind(sanction.endsAt, now);
              const at =
                sanction.endsAt === null
                  ? ''
                  : format.dateTime(
                      new Date(sanction.endsAt),
                      kind === 'time'
                        ? { hour: '2-digit', minute: '2-digit' }
                        : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' },
                    );
              return (
                <li key={sanction.id} data-type={sanction.type} className="grid gap-1">
                  <p className="text-md font-semibold text-balance">
                    {t(`notice.title.${sanction.type as 'ban' | 'gag' | 'mute'}`)}
                    <span className="font-normal text-muted-foreground">
                      {' · '}
                      <span suppressHydrationWarning>{t(`notice.until.${kind}`, { at })}</span>
                    </span>
                  </p>
                  <p className="text-[13.5px] text-muted-foreground">
                    {t('notice.reason', { category: t(`categories.${sanction.category}`) })}
                    {' — '}
                    <span className="text-foreground [overflow-wrap:anywhere]">
                      {sanction.reason}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="max-w-[72ch] text-[13px] text-muted-foreground">
            {banned ? `${t('notice.bannedSite')} ` : null}
            {t('notice.appeal', { hours: APPEAL_RESPONSE_HOURS })}
          </p>
          <div className="-ml-3 flex flex-wrap gap-1">
            <Button asChild variant="ghost" size="sm">
              <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer">
                <BrandIcon icon={siDiscord} size={15} />
                {t('notice.discord')}
              </a>
            </Button>
            <Button asChild variant="quiet" size="sm">
              <Link href={APPEAL_PATH as Route}>{t('notice.appealLink')}</Link>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}
