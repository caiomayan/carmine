import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { locale } from '@/i18n/request';
import { DEFAULT_THEME, themeInitScript } from '@/lib/theme';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

const MAIN_CONTENT_ID = 'conteudo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return {
    title: { default: t('title'), template: t('titleTemplate') },
    description: t('description'),
  };
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: '#0f0d0b',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('shell');

  return (
    // O script do <head> troca data-theme antes da hidratação; a diferença é esperada.
    <html
      lang={locale}
      data-theme={DEFAULT_THEME}
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: string constante, aplica o tema salvo antes da primeira pintura */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <a className="skip-link" href={`#${MAIN_CONTENT_ID}`}>
          {t('skipToContent')}
        </a>
        <SiteHeader />
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="site-main">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
