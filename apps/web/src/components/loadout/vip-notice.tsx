import type { VipStatus } from '@carmine/contracts';
import { vipNoticeAt } from '@carmine/contracts/rules';
import type { Route } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';

/**
 * Aviso do fim do Período VIP (S05): 3 dias antes, no dia do fim e no dia em que acabou. Sóbrio:
 * a cor de contexto do VIP fica só no ponto; o texto diz o que muda no jogo. Com `renewHref`, o aviso leva aos Pacotes
 * (S14b): quem está perto do fim, ou acabou de perder o VIP, vê de onde renovar. Com `holdDays` (a guarda dos Itens VIP
 * ligada, S14a), o texto diz que os Itens saem do Inventário e ficam guardados por esse prazo; sem ele, os Itens
 * seguem no Inventário e só deixam de ir para o jogo.
 */
export async function VipNotice({
  vip,
  holdDays = null,
  className,
  renewHref,
}: {
  vip: VipStatus;
  /** `vipHoldDays` da sessão: nulo com a guarda desligada. */
  holdDays?: number | null;
  className?: string;
  renewHref?: string;
}) {
  const notice = vipNoticeAt(vip, new Date());
  if (!notice) return null;
  const t = await getTranslations('loadout.vip');
  const format = await getFormatter();
  const endsAt = vip.endsAt ? new Date(vip.endsAt) : null;

  return (
    <p
      role="status"
      data-testid="vip-notice"
      data-notice={notice}
      className={cn(
        'flex max-w-[80ch] animate-fade-up items-start gap-2.5 rounded-lg bg-surface px-3 py-2 text-body-sm leading-[1.5]',
        className,
      )}
    >
      <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-vip" />
      <span>
        {notice === 'ending_soon' && endsAt
          ? t(holdDays === null ? 'ending_soon' : 'ending_soon_held', {
              date: format.dateTime(endsAt, { day: 'numeric', month: 'long' }),
              days: holdDays ?? 0,
            })
          : notice === 'ending_today' && endsAt
            ? t(holdDays === null ? 'ending_today' : 'ending_today_held', {
                time: format.dateTime(endsAt, { hour: '2-digit', minute: '2-digit' }),
                days: holdDays ?? 0,
              })
            : t(holdDays === null ? 'ended_today' : 'ended_today_held', { days: holdDays ?? 0 })}
        {renewHref ? (
          <>
            {' '}
            <Link
              href={renewHref as Route}
              prefetch={false}
              data-testid="vip-notice-renew"
              className="font-semibold underline underline-offset-4"
            >
              {t('renew')}
            </Link>
          </>
        ) : null}
      </span>
    </p>
  );
}
