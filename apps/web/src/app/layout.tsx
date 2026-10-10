import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MotionProvider } from '@/components/motion-provider';
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
  themeColor: '#11100d',
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
        {/* Só o idioma vai ao cliente; as mensagens ficam no servidor e chegam como props. */}
        <NextIntlClientProvider messages={null}>
          <MotionProvider>
            <a
              href={`#${MAIN_CONTENT_ID}`}
              className="fixed top-3 left-3 z-100 -translate-y-[calc(100%+1.5rem)] rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground transition-transform duration-(--dur-base) ease-out focus-visible:translate-y-0 focus-visible:outline-foreground"
            >
              {t('skipToContent')}
            </a>
            {/* Cabeçalho e conteúdo ocupam ao menos a tela inteira: o rodapé só aparece no fim real da página. */}
            <div className="flex min-h-dvh flex-col">
              <SiteHeader />
              <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex-1 outline-none">
                {children}
              </main>
            </div>
            <SiteFooter />
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
