import { getTranslations } from 'next-intl/server';
import { PageHead } from '@/components/page-head';

const SKELETON_ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];

export default async function RankingLoading() {
  const t = await getTranslations('ranking');

  return (
    <div className="container-page">
      <PageHead title={t('title')} subtitle={t('subtitle')} />
      <p className="sr-only" role="status">
        {t('loading')}
      </p>
      <div aria-hidden="true" className="grid gap-0.5 pt-2">
        {SKELETON_ROWS.map((id) => (
          <div key={id} className="h-14 shimmer rounded-lg" />
        ))}
      </div>
    </div>
  );
}
