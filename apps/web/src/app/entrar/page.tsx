import { safeReturnPath } from '@carmine/contracts';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { siSteam } from 'simple-icons';
import { BadgeAlertIcon } from '@/components/icons/animated/badge-alert';
import { HistoryIcon } from '@/components/icons/animated/history';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { BrandIcon } from '@/components/icons/brand-icon';
import { Seal } from '@/components/seal';
import { Button } from '@/components/ui/button';
import { getServerSession } from '@/lib/api-server';
import { parseLoginError, steamLoginHref } from '@/lib/auth-links';
import { cn } from '@/lib/utils';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('signIn');
  return { title: t('metaTitle'), robots: { index: false } };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const back = safeReturnPath(first(params.voltar));
  const error = parseLoginError(params.erro);
  const expired = first(params.motivo) === 'sessao-expirada';

  // Quem já entrou não tem o que fazer aqui: segue para onde ia.
  const server = await getServerSession();
  if (server.status === 'authenticated') redirect(back as Route);

  const t = await getTranslations('signIn');

  return (
    <div className="container-page grid min-h-[min(72vh,640px)] place-items-center py-12 max-md:place-items-start max-md:py-8">
      <div className="grid w-full max-w-[440px] gap-7">
        <LinkMark />

        <div className="grid animate-fade-up gap-2.5">
          <h1 className="text-display max-md:text-[26px]">{t('title')}</h1>
          <p className="text-md text-muted-foreground">{t('subtitle')}</p>
        </div>

        {error || expired ? (
          <Notice tone={error ? 'danger' : 'info'}>
            {error ? t(`errors.${error}`) : t('sessionExpired')}
          </Notice>
        ) : null}

        <div className="grid animate-fade-up gap-3 [animation-delay:60ms]">
          <Button asChild className="min-h-12 w-full text-[15px] max-md:min-h-12">
            {/* Navegação para a API (não é rota do web): âncora simples, sem prefetch. */}
            <a href={steamLoginHref(back)} data-testid="steam-login">
              <BrandIcon icon={siSteam} size={18} />
              {t('steamButton')}
            </a>
          </Button>
          <Button asChild variant="quiet" className="justify-self-center">
            <Link href={back as Route}>{t('back')}</Link>
          </Button>
        </div>

        <div className="grid animate-fade-up gap-2 text-body-sm leading-[1.6] text-muted-foreground [animation-delay:120ms]">
          <p>{t('steamNote')}</p>
          <p>{t('claimNote')}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * O vínculo da Conta com a Steam, desenhado: o selo da Carmine e a marca da Steam ligados
 * por um traço que se desenha na chegada (parado com movimento reduzido).
 */
function LinkMark() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 text-foreground">
      <Seal size={44} />
      <svg
        aria-hidden="true"
        width="56"
        height="2"
        viewBox="0 0 56 2"
        className="overflow-visible text-line-strong"
      >
        <line
          x1="0"
          y1="1"
          x2="56"
          y2="1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="3 5"
          className="link-draw"
        />
      </svg>
      <span className="grid size-11 place-items-center rounded-full bg-surface-2">
        <BrandIcon icon={siSteam} size={22} />
      </span>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'danger' | 'info'; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      data-icon-trigger
      className="grid animate-fade-up grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg bg-surface px-4 py-3.5 text-body-sm leading-[1.55]"
    >
      <AnimatedIcon
        icon={tone === 'danger' ? BadgeAlertIcon : HistoryIcon}
        size={16}
        className={cn('mt-0.5', tone === 'danger' ? 'text-status-danger' : 'text-status-info')}
      />
      <p>{children}</p>
    </div>
  );
}
