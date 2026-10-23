import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NotFoundView } from '@/components/not-found-view';
import { SavedTheme } from '@/components/saved-theme';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound');
  return { title: t('metaTitle') };
}

export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <>
      <SavedTheme />
      <NotFoundView code={t('code')} title={t('title')} body={t('body')} back={t('back')} />
    </>
  );
}
