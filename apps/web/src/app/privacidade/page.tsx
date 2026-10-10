import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHead } from '@/components/page-head';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('privacy');
  return { title: t('title') };
}

export default async function PrivacyPage() {
  const t = await getTranslations('privacy');

  return (
    <div className="container page">
      <PageHead title={t('title')} />
      <p className="prose">{t('body')}</p>
    </div>
  );
}
