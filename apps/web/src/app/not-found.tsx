import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeftIcon } from '@/components/icons/animated/arrow-left';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound');
  return { title: t('metaTitle') };
}

export default async function NotFound() {
  const t = await getTranslations('notFound');

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
          <span className="label-caps text-muted-foreground">{t('code')}</span>
        </div>
      </div>
    </div>
  );
}
