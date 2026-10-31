import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { VipView } from '@/components/vip/vip-view';
import { getServerSession, getVipPackages } from '@/lib/api-server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vip');
  return { title: t('metaTitle'), description: t('metaDescription') };
}

/** `/plans`: os Pacotes lidos da API e o VIP da sessão (se houver) entram na `VipView`. */
export default async function VipPage() {
  const [packages, session] = await Promise.all([getVipPackages(), getServerSession()]);
  const vip = session.status === 'authenticated' ? session.session.vip : null;
  const holdDays = session.status === 'authenticated' ? session.session.vipHoldDays : null;
  return <VipView packages={packages} vip={vip} holdDays={holdDays} />;
}
