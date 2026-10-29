import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { siSteam } from 'simple-icons';
import { EmptyState } from '@/components/empty-state';
import { BadgeAlertIcon } from '@/components/icons/animated/badge-alert';
import { UserIcon } from '@/components/icons/animated/user';
import { BrandIcon } from '@/components/icons/brand-icon';
import { PageHead } from '@/components/page-head';
import { SettingsShell } from '@/components/settings/settings-shell';
import { Button } from '@/components/ui/button';
import { getServerSession } from '@/lib/api-server';
import { signInHref } from '@/lib/auth-links';
import { SETTINGS_BASE, SETTINGS_SECTIONS } from '@/lib/settings-nav';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/**
 * Configurações da Conta (`/settings`): Perfil, Conexões, Aparência e Dados e conta, numa
 * navegação lateral (no celular, uma lista que leva a cada seção). Sem sessão, convida a entrar;
 * com a API fora, avisa (nunca mostra a tela vazia). Só as mensagens de `settings` vão ao cliente.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('settings');
  const { settings } = await getMessages();
  const server = await getServerSession();
  const head = <PageHead title={t('title')} subtitle={t('subtitle')} />;

  if (server.status !== 'authenticated') {
    const signedOut = server.status === 'anonymous';
    return (
      <div className="container-page animate-fade-up pb-16">
        {head}
        <div className="rounded-xl bg-surface" data-testid="settings-signed-out">
          <EmptyState
            icon={signedOut ? UserIcon : BadgeAlertIcon}
            title={signedOut ? t('signedOut.title') : t('unavailable.title')}
            body={signedOut ? t('signedOut.body') : t('unavailable.body')}
            action={
              signedOut ? (
                <Button asChild>
                  <Link href={signInHref(SETTINGS_BASE) as Route}>
                    <BrandIcon icon={siSteam} size={16} />
                    {t('signedOut.action')}
                  </Link>
                </Button>
              ) : null
            }
          />
        </div>
      </div>
    );
  }

  return (
    <NextIntlClientProvider messages={{ settings }}>
      <SettingsShell
        head={head}
        labels={{
          nav: t('nav.label'),
          back: t('nav.back'),
          sections: Object.fromEntries(
            SETTINGS_SECTIONS.map((section) => [section, t(`nav.${section}`)]),
          ) as Record<(typeof SETTINGS_SECTIONS)[number], string>,
        }}
      >
        {children}
      </SettingsShell>
    </NextIntlClientProvider>
  );
}
