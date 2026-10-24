import { getTranslations } from 'next-intl/server';
import { HomeSkeleton } from '@/components/home/skeleton';

/** O esqueleto da Home enquanto a página sai do servidor (a mesma grade da Home de verdade). */
export default async function ServersLoading() {
  const t = await getTranslations('servers');
  return <HomeSkeleton label={t('loading')} />;
}
