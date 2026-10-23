import { getTranslations } from 'next-intl/server';
import { PageHead } from '@/components/page-head';
import { ServerCardsSkeleton } from '@/components/servers/server-list';

export default async function ServersLoading() {
  const t = await getTranslations('servers');

  return (
    <div className="container-page">
      <PageHead title={t('title')} subtitle={t('subtitle')} />
      <section aria-label={t('listLabel')} aria-busy="true" className="pt-2">
        <p className="sr-only" role="status">
          {t('loading')}
        </p>
        <ServerCardsSkeleton loading />
      </section>
    </div>
  );
}
