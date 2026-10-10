import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MainNav } from './main-nav';
import { ThemeToggle } from './theme-toggle';
import { Wordmark } from './wordmark';

export async function SiteHeader() {
  const t = await getTranslations('shell');

  return (
    <header className="border-b border-line">
      <div className="container-page flex min-h-(--hdr-h) flex-wrap items-center gap-x-7 max-md:gap-x-3 max-md:pt-2">
        <Link
          href="/"
          aria-label={t('homeLink')}
          className="inline-flex items-center rounded-xs text-foreground transition-opacity duration-(--dur-fast) ease-std hover:opacity-80 focus-visible:outline-offset-6"
        >
          <Wordmark className="h-(--wm-h) w-auto overflow-visible" />
        </Link>
        <MainNav
          label={t('mainNav')}
          items={[
            { href: '/', label: t('nav.servers') },
            { href: '/inventario', label: t('nav.inventory') },
          ]}
          className="max-md:order-last max-md:-mx-3 max-md:w-[calc(100%+1.5rem)] max-md:pb-1"
        />
        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle labels={{ light: t('theme.useLight'), dark: t('theme.useDark') }} />
        </div>
      </div>
    </header>
  );
}
