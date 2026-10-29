import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NotFoundView } from '@/components/not-found-view';
import { SavedTheme } from '@/components/saved-theme';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('serverPage.notFound');
  return { title: t('title') };
}

/** 404 próprio do servidor: o endereço não é de um Servidor Carmine (ou ele foi descadastrado). */
export default async function ServerNotFound() {
  const t = await getTranslations('serverPage.notFound');
  const code = (await getTranslations('notFound'))('code');

  return (
    <>
      <SavedTheme />
      <NotFoundView code={code} title={t('title')} body={t('body')} back={t('back')} />
    </>
  );
}
