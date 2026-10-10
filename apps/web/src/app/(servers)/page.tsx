import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { PageHead } from '@/components/page-head';
import { SectionTitle } from '@/components/section-title';
import { ServerListColumns, ServerRowSkeleton } from '@/components/server-list';
import styles from './servers.module.css';

const GHOST_ROWS = ['ghost-1', 'ghost-2', 'ghost-3', 'ghost-4'];

export default async function ServersPage() {
  const t = await getTranslations('servers');

  return (
    <div className="container page">
      <PageHead title={t('title')} subtitle={t('subtitle')} />
      <section aria-labelledby="regiao-sao-paulo">
        <SectionTitle id="regiao-sao-paulo">{t('region')}</SectionTitle>
        <ServerListColumns
          labels={{
            server: t('columns.server'),
            map: t('columns.map'),
            players: t('columns.players'),
            status: t('columns.status'),
          }}
        />
        {/* Os dados ao vivo chegam na S06; até lá, a silhueta da lista com o estado vazio. */}
        <div className={styles.stage}>
          <div className={styles.ghosts} aria-hidden="true">
            {GHOST_ROWS.map((id, i) => (
              <ServerRowSkeleton key={id} index={i} />
            ))}
          </div>
          <EmptyState className={styles.empty} title={t('empty.title')} body={t('empty.body')} />
        </div>
      </section>
    </div>
  );
}
