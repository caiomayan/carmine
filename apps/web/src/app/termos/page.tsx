import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHead } from '@/components/page-head';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('terms');
  return { title: t('title') };
}

export default async function TermsPage() {
  const t = await getTranslations('terms');

  return (
    <div className="container page">
      <PageHead title={t('title')} />
      <p className="prose">{t('body')}</p>
    </div>
  );
}
