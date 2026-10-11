import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHead } from '@/components/page-head';
import { DraftDemo } from '@/components/session/draft-demo';

// Como a vitrine de componentes: só existe com CARMINE_UI_GALLERY=1 (dev e E2E).
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('devDraft');
  return { title: t('title'), robots: { index: false } };
}

export default async function DraftDemoPage() {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  const t = await getTranslations('devDraft');
  const drafts = await getTranslations('drafts');

  return (
    <div className="container-page animate-fade-up pb-16">
      <PageHead title={t('title')} subtitle={t('subtitle')} />
      <DraftDemo
        labels={{
          field: t('field'),
          save: t('save'),
          saved: t('saved'),
          signInFirst: t('signInFirst'),
          restored: drafts('restored'),
          discard: drafts('discard'),
        }}
      />
    </div>
  );
}
