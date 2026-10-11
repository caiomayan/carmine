import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from '@/components/icons/animated/arrow-left';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
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

  return (
    <div className="container-page grid min-h-[min(60vh,520px)] animate-fade-up place-items-center py-12">
      <div className="grid w-full max-w-[520px] gap-3">
        <h1 className="text-display max-md:text-[26px]">{t('title')}</h1>
        <p className="max-w-[48ch] text-md text-muted-foreground">{t('body')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Button asChild>
            <Link href="/">
              <AnimatedIcon icon={ArrowLeftIcon} size={16} />
              {t('back')}
            </Link>
          </Button>
          <span className="label-caps text-muted-foreground">{code}</span>
        </div>
      </div>
    </div>
  );
}
