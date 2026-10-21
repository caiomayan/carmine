import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { MainNav } from './main-nav';
import { AccountControl } from './session/account-control';
import { ThemeToggle } from './theme-toggle';
import { Wordmark } from './wordmark';

export async function SiteHeader() {
  const t = await getTranslations('shell');

  return (
    <header className="border-b border-line">
      {/* Desktop: logotipo, páginas ao centro e ações à direita (3 colunas, o centro de verdade). Celular: logotipo e ações em cima, as páginas embaixo. */}
      <div className="container-page flex min-h-(--hdr-h) flex-wrap items-center gap-x-7 max-md:gap-x-3 max-md:pt-2 md:grid md:grid-cols-[1fr_auto_1fr]">
        <Link
          href="/"
          aria-label={t('homeLink')}
          className="-mx-2 inline-flex items-center justify-self-start rounded-md px-2 py-1.5 text-foreground transition-[opacity,background-color] duration-(--dur-fast) ease-std hover:opacity-80 focus-visible:bg-(--fill-focus) focus-visible:opacity-100 focus-visible:outline-none"
        >
          <Wordmark className="h-(--wm-h) w-auto overflow-visible" />
        </Link>
        <MainNav
          label={t('mainNav')}
          items={[
            { href: '/', label: t('nav.servers') },
            { href: '/loadout', label: t('nav.loadout') },
            { href: '/inventario', label: t('nav.inventory') },
            { href: '/ranking', label: t('nav.ranking') },
          ]}
          className="md:justify-self-center max-md:order-last max-md:-mx-3 max-md:w-[calc(100%+1.5rem)] max-md:pb-1"
        />
        <div className="ml-auto flex items-center gap-2.5 md:ml-0 md:justify-self-end">
          <ThemeToggle labels={{ light: t('theme.useLight'), dark: t('theme.useDark') }} />
          <AccountControl
            labels={{
              signIn: t('account.signIn'),
              loading: t('account.loading'),
              // Modelo com {name} literal, preenchido no cliente com a Conta da sessão.
              menu: t('account.menu', { name: '{name}' }),
              profile: t('account.profile'),
              inventory: t('account.inventory'),
              loadout: t('account.loadout'),
              settings: t('account.settings'),
              home: t('account.home'),
              // Modelos com {days} literal: os dias vêm da sessão, no cliente.
              vipOne: t('account.vipOne', { days: '{days}' }),
              vipOther: t('account.vipOther', { days: '{days}' }),
              playing: t('account.playing'),
              firstSteps: t('account.firstSteps'),
              staffPanel: t('account.staffPanel'),
              signOut: t('account.signOut'),
              signOutFailed: t('account.signOutFailed'),
            }}
          />
        </div>
      </div>
    </header>
  );
}
