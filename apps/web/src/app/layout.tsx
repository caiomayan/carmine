import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MotionProvider } from '@/components/motion-provider';
import { FirstSteps } from '@/components/session/first-steps';
import { SessionProvider } from '@/components/session/session-provider';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { ThemeScript } from '@/components/theme-script';
import { locale } from '@/i18n/request';
import { getServerSession } from '@/lib/api-server';
import { FIRST_STEPS_COOKIE, hasDismissedFirstSteps } from '@/lib/first-steps';
import { DEFAULT_THEME } from '@/lib/theme';
import './globals.css';

const inter = Inter({
  // Só o latin é pré-carregado: cobre todos os acentos do PT-BR. O latin-ext continua no CSS e
  // baixa sob demanda (nomes de exibição com outros caracteres), sem disputar banda no 4G lento.
  subsets: ['latin'],
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
  const tSteps = await getTranslations('firstSteps');
  // A sessão é lida no servidor: quem entrou já recebe a página com o avatar, sem piscar
  // "Entrar"; o navegador confirma depois em /api/me (e renova a sessão).
  const server = await getServerSession();
  const session = server.status === 'authenticated' ? server.session : null;
  const dismissed = (await cookies()).get(FIRST_STEPS_COOKIE)?.value;
  // Abrem sozinhos só na sessão do primeiro login da Conta; depois, só pelo menu.
  const firstStepsOpen =
    session?.firstLogin === true && !hasDismissedFirstSteps(dismissed, session.account.publicId);
  const step = (key: 'what' | 'steam' | 'equip' | 'ingame') => ({
    title: tSteps(`steps.${key}.title`),
    body: tSteps.rich(`steps.${key}.body`, {
      cmd: (chunks) => (
        <code className="rounded-sm bg-surface-2 px-1 py-px font-semibold text-foreground">
          {chunks}
        </code>
      ),
    }),
  });

  return (
    // O script do <head> troca data-theme antes da hidratação; a diferença é esperada.
    <html
      lang={locale}
      data-theme={DEFAULT_THEME}
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        {/* Só o idioma vai ao cliente; as mensagens ficam no servidor e chegam como props. */}
        <NextIntlClientProvider messages={null}>
          <MotionProvider>
            <SessionProvider
              initialSession={session}
              initialStatus={server.status}
              firstStepsOpen={firstStepsOpen}
            >
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
                  <FirstSteps
                    labels={{
                      // Modelo com {name}: o nome vem da sessão no cliente, então vai sem formatar.
                      title: tSteps.raw('title'),
                      intro: tSteps('intro'),
                      close: tSteps('close'),
                      done: tSteps('done'),
                      toInventory: tSteps('toInventory'),
                      reopenHint: tSteps('reopenHint'),
                      steps: {
                        what: step('what'),
                        steam: step('steam'),
                        equip: step('equip'),
                        ingame: step('ingame'),
                      },
                    }}
                  />
                  {children}
                </main>
              </div>
              <SiteFooter />
            </SessionProvider>
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
