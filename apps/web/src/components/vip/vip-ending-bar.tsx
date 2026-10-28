import type { VipStatus } from '@carmine/contracts';
import { vipNoticeAt } from '@carmine/contracts/rules';
import { getFormatter, getTranslations } from 'next-intl/server';
import { isEndingNotice } from '@/lib/vip/ending';
import { VipEndingBand } from './vip-ending-band';

/**
 * A faixa do fim do VIP em todas as páginas, logo abaixo do cabeçalho (S14b): só nos 3 dias antes do fim e no dia, com o
 * link para os Pacotes. Nasce no servidor com o VIP da sessão, então já vem no HTML e a página não se mexe quando o
 * JavaScript chega. O "acabou hoje" não vira faixa: fica no aviso do Loadout.
 */
export async function VipEndingBar({ vip, nonce }: { vip: VipStatus | null; nonce?: string }) {
  if (!vip) return null;
  const notice = vipNoticeAt(vip, new Date());
  if (!isEndingNotice(notice) || !vip.endsAt) return null;
  const t = await getTranslations('vipBand');
  const format = await getFormatter();
  const endsAt = new Date(vip.endsAt);
  const text =
    notice === 'ending_today'
      ? t('ending_today', { time: format.dateTime(endsAt, { hour: '2-digit', minute: '2-digit' }) })
      : t('ending_soon', { date: format.dateTime(endsAt, { day: 'numeric', month: 'long' }) });
  return (
    <VipEndingBand
      notice={notice}
      text={text}
      link={t('link')}
      dismiss={t('dismiss')}
      label={t('label')}
      nonce={nonce}
    />
  );
}
