import type { Route } from 'next';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { CurtainController, FooterLastEvent, FooterWordmark } from '@/components/footer/footer-fx';
import { FooterStatus } from '@/components/footer-status';
import { BrandIcon } from '@/components/icons/brand-icon';
import { Seal } from '@/components/seal';
import { artPair } from '@/components/vida/map-art';
import { Wordmark } from '@/components/wordmark';
import { getActivityView } from '@/lib/activity/server';
import { getLiveServers } from '@/lib/api-server';
import { featuredMap } from '@/lib/featured-map';
import { SOCIAL_LINKS } from '@/lib/social';

type FooterLink = { label: string; href: Route } | { label: string; href: string; external: true };

/** Link do rodapé: texto pleno e um sublinhado que cresce da esquerda no hover e no foco. */
function FooterLinkItem({ link }: { link: FooterLink }) {
  const className =
    'group inline-flex min-h-(--tap) items-center rounded-xs text-body-sm text-foreground';
  const label = (
    <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-[position:0_100%] bg-no-repeat pb-px transition-[background-size] duration-(--dur-base) ease-out group-hover:bg-[length:100%_1px] group-focus-visible:bg-[length:100%_1px] motion-reduce:transition-none">
      {link.label}
    </span>
  );
  return 'external' in link ? (
    <a href={link.href} className={className} rel="noopener noreferrer" target="_blank">
      {label}
    </a>
  ) : (
    <Link href={link.href} className={className}>
      {label}
    </Link>
  );
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <h2 className="mb-2.5 label-caps text-muted-foreground">{title}</h2>
      <ul className="grid gap-0.5">
        {links.map((link) => (
          <li key={link.href}>
            <FooterLinkItem link={link} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function SiteFooter() {
  const t = await getTranslations('shell.footer');
  const discord = SOCIAL_LINKS.find((s) => s.id === 'discord');
  const [servers, activity] = await Promise.all([getLiveServers(), getActivityView()]);
  const messages = await getMessages();
  const { status, last } = messages.shell.footer;
  // O mapa em destaque (o do servidor mais cheio agora) aparece dentro das letras do wordmark.
  const map = featuredMap(servers?.servers);

  const community: FooterLink[] = [{ label: t('links.rules'), href: '/regras' }];
  if (discord) community.push({ label: t('links.discord'), href: discord.href, external: true });

  return (
    <footer data-site-footer className="relative overflow-hidden">
      <CurtainController />
      <div data-ft="top" className="container-page pt-12 max-md:pt-8">
        {/* A faixa viva: o estado dos servidores (resumo ao vivo) e o último acontecimento. */}
        <NextIntlClientProvider
          messages={{ shell: { footer: { status, last } }, activity: messages.activity }}
        >
          <div className="flex flex-wrap items-stretch gap-3 max-md:flex-col">
            <FooterStatus initial={servers?.summary ?? null} />
            <FooterLastEvent initial={activity} />
          </div>
        </NextIntlClientProvider>
        <div
          data-ft="links"
          className="grid grid-cols-2 gap-x-7 gap-y-9 pt-14 pb-10 max-md:gap-x-5 max-md:gap-y-7 max-md:pt-10 max-md:pb-7 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] lg:gap-10"
        >
          <div className="col-span-2 grid content-start gap-4.5 lg:col-span-1">
            <Link
              href="/"
              aria-label={t('homeLink')}
              className="flex w-fit items-center gap-3.5 rounded-xs text-foreground focus-visible:outline-offset-4"
            >
              <Seal size={44} />
              <Wordmark className="h-6 w-auto overflow-visible" />
            </Link>
            <p
              data-ft="tagline"
              className="max-w-[34ch] text-[13.5px] leading-[1.55] text-muted-foreground"
            >
              {t('tagline')}
            </p>
            {SOCIAL_LINKS.length > 0 ? (
              <ul aria-label={t('social.label')} className="-ml-2.5 flex gap-1">
                {SOCIAL_LINKS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={s.href}
                      rel="noopener noreferrer"
                      target="_blank"
                      aria-label={t(`social.${s.id}`)}
                      className="grid size-(--tap) place-items-center rounded-md text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground"
                    >
                      <BrandIcon icon={s.icon} size={16} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <nav
            aria-label={t('nav')}
            className="col-span-2 grid grid-cols-2 gap-x-7 gap-y-7 max-md:gap-x-5 md:grid-cols-3 lg:col-span-3 lg:gap-10"
          >
            <FooterColumn
              title={t('columns.play')}
              links={[
                { label: t('links.servers'), href: '/' },
                { label: t('links.inventory'), href: '/inventario' },
                { label: t('links.ranking'), href: '/ranking' },
              ]}
            />
            <FooterColumn title={t('columns.community')} links={community} />
            <FooterColumn
              title={t('columns.legal')}
              links={[
                { label: t('links.terms'), href: '/termos' },
                { label: t('links.privacy'), href: '/privacidade' },
                { label: t('links.refund'), href: '/reembolso' },
                { label: t('links.contact'), href: '/contato' },
              ]}
            />
          </nav>
        </div>
        <div
          data-ft="legal"
          className="flex flex-wrap justify-between gap-x-6 gap-y-2 pt-5 pb-9 text-xs text-muted-foreground"
        >
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
          <p className="max-w-[70ch]">{t('disclaimer')}</p>
        </div>
      </div>
      <div className="px-4 pb-3 max-md:px-3">
        <FooterWordmark map={map} art={artPair(map)} />
      </div>
    </footer>
  );
}
