import { getTranslations } from 'next-intl/server';
import { PageHead } from '@/components/page-head';
import { SectionTitle } from '@/components/section-title';
import { ServerListColumns, ServerRowSkeleton } from '@/components/servers/server-list';

const SKELETON_ROWS = ['skel-1', 'skel-2', 'skel-3', 'skel-4', 'skel-5', 'skel-6'];

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
        <ServerListColumns
          labels={{
            server: t('columns.server'),
            map: t('columns.map'),
            players: t('columns.players'),
            state: t('columns.state'),
          }}
        />
        <div aria-hidden="true">
          {SKELETON_ROWS.map((id, i) => (
            <ServerRowSkeleton key={id} index={i} loading />
          ))}
        </div>
      </section>
    </div>
  );
}
