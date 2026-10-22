import type { VipStatus } from '@carmine/contracts';
import { vipNoticeAt } from '@carmine/contracts/rules';
import { getFormatter, getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';

/**
 * Aviso do fim do Período VIP (S05): 3 dias antes, no dia do fim e no dia em que acabou. Sóbrio:
 * a cor de contexto do VIP fica só no ponto; o texto diz o que muda no jogo.
 */
export async function VipNotice({ vip, className }: { vip: VipStatus; className?: string }) {
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
          ? t('ending_soon', { date: format.dateTime(endsAt, { day: 'numeric', month: 'long' }) })
          : notice === 'ending_today' && endsAt
            ? t('ending_today', {
                time: format.dateTime(endsAt, { hour: '2-digit', minute: '2-digit' }),
              })
            : t('ended_today')}
      </span>
    </p>
  );
}
