import { getTranslations } from 'next-intl/server';
import { PageHead } from '@/components/page-head';
import { SectionTitle } from '@/components/section-title';
import { ServerCardsSkeleton } from '@/components/servers/server-list';

export default async function ServersLoading() {
  const t = await getTranslations('servers');

  return (
    <div className="container-page">
      <PageHead title={t('title')} subtitle={t('subtitle')} />
      <section aria-labelledby="regiao-sao-paulo" aria-busy="true" className="pt-2">
        <SectionTitle id="regiao-sao-paulo">{t('regions.sao-paulo')}</SectionTitle>
        <p className="sr-only" role="status">
          {t('loading')}
        </p>
        <ServerCardsSkeleton loading />
      </section>
    </div>
  );
}
