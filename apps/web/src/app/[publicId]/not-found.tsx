import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { NotFoundView } from '@/components/not-found-view';
import { PROFILE_PATH_HEADER } from '@/lib/auth-links';
import RootNotFound, { generateMetadata as rootMetadata } from '../not-found';

/** Só caminhos numéricos são endereços de Perfil; `/nao-existe` cai aqui e leva o 404 geral. */
async function isProfilePath() {
  return (await headers()).get(PROFILE_PATH_HEADER) === '1';
}

export async function generateMetadata(): Promise<Metadata> {
  if (!(await isProfilePath())) return rootMetadata();
  const t = await getTranslations('profile.notFound');
  return { title: t('metaTitle') };
}

/** 404 próprio do Perfil: o ID não existe (ou o SteamID64 nunca jogou nem entrou). */
export default async function ProfileNotFound() {
  if (!(await isProfilePath())) return <RootNotFound />;
  const t = await getTranslations('profile.notFound');
  const code = (await getTranslations('notFound'))('code');

  return <NotFoundView code={code} title={t('title')} body={t('body')} back={t('back')} />;
}
