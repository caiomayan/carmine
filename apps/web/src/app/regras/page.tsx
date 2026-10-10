import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DraftDocument } from '@/components/draft-document';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rules');
  return { title: t('title') };
}

export default async function RulesPage() {
  const t = await getTranslations('rules');
  return <DraftDocument title={t('title')} status={t('status')} body={t('body')} />;
}
