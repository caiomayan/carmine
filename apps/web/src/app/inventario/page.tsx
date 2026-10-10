import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { BoxIcon } from '@/components/icons/animated/box';
import { PageHead } from '@/components/page-head';
import { SectionTitle } from '@/components/section-title';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('inventory');
  return { title: t('title') };
}

export default async function InventoryPage() {
  const t = await getTranslations('inventory');

  return (
    <div className="container-page animate-fade-up pb-16">
      <PageHead title={t('title')} subtitle={t('subtitle')} />
      <section aria-labelledby="seus-itens" className="pt-2">
        <SectionTitle id="seus-itens">{t('section')}</SectionTitle>
        <div className="rounded-xl bg-surface">
          <EmptyState icon={BoxIcon} title={t('empty.title')} body={t('empty.body')} />
        </div>
      </section>
    </div>
  );
}
