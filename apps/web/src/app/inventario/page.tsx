import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { PageHead } from '@/components/page-head';
import { SectionTitle } from '@/components/section-title';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('inventory');
  return { title: t('title') };
}

export default async function InventoryPage() {
  const t = await getTranslations('inventory');

  return (
    <div className="container page">
      <PageHead title={t('title')} subtitle={t('subtitle')} />
      <section aria-labelledby="seus-itens">
        <SectionTitle id="seus-itens">{t('section')}</SectionTitle>
        <EmptyState title={t('empty.title')} body={t('empty.body')} />
      </section>
    </div>
  );
}
