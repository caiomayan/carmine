import type { VipStatus } from '@carmine/contracts';
import { REFUND_WINDOW_DAYS, type VipPackages } from '@carmine/contracts/payments';
import type { Route } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { RefreshCWIcon } from '@/components/icons/animated/refresh-cw';
import { VipNotice } from '@/components/loadout/vip-notice';
import { bestValueId, buyState } from '@/lib/vip/packages';
import { Compare } from './compare';
import { PackageCard } from './package-card';
import '@/app/vip/vip.css';

/**
 * A página do VIP (S14b): o que é grátis e o que é VIP, os Pacotes e como a compra funciona. Só apresenta: os Pacotes
 * e o estado da compra (aberta, "Em breve", se esta Conta pode comprar) vêm da API (`packages`) e o VIP da Conta, da
 * sessão (`vip`); nada de preço escrito à mão. A confirmação da compra é outra página (`/vip/comprar`). A vitrine
 * `/dev/vip` mostra cada estado com dados de exemplo.
 */
export async function VipView({
  packages,
  vip,
}: {
  packages: VipPackages | null;
  vip: VipStatus | null;
}) {
  const t = await getTranslations('vip');
  const format = await getFormatter();
  const day = (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'long' });

  const data = packages;
  const state = data ? buyState(data) : null;
  const best = data ? bestValueId(data.packages) : null;

  return (
    <div className="container-page vp pb-24" data-testid="vip-page">
      <header className="vp-hero animate-fade-up">
        <p className="v-label vp-eyebrow">
          <span aria-hidden="true" className="vp-dot" />
          {t('eyebrow')}
        </p>
        <h1 className="vp-title v-serif">{t('title')}</h1>
        <p className="vp-lead">{t('subtitle')}</p>
        <div aria-hidden="true" className="vp-slots">
          {Array.from({ length: 8 }, (_, slot) => (
            <i
              // biome-ignore lint/suspicious/noArrayIndexKey: oito vagas fixas e decorativas
              key={slot}
              className="vp-slot"
            />
          ))}
          <i className="vp-slot vp-slot-vip">VIP</i>
        </div>
      </header>

      {data?.sandbox ? (
        <aside role="note" className="vp-sandbox" data-testid="vip-sandbox">
          <b>{t('sandbox.title')}</b>
          <span>{t('sandbox.body')}</span>
        </aside>
      ) : null}

      {vip?.active && vip.endsAt ? (
        <div className="vp-yours" data-testid="vip-yours">
          <p className="vp-yours-title">{t('yours.active', { date: day(vip.endsAt) })}</p>
          <p>{t('yours.activeBody')}</p>
          <VipNotice vip={vip} className="mt-1" />
        </div>
      ) : vip?.endedAt ? (
        <div className="vp-yours" data-testid="vip-yours">
          <p className="vp-yours-title">{t('yours.ended', { date: day(vip.endedAt) })}</p>
          <p>{t('yours.endedBody')}</p>
        </div>
      ) : null}

      <section aria-labelledby="vip-packages" className="vp-section">
        <div className="vp-section-head">
          <h2 id="vip-packages" className="v-title">
            {t('packages.title')}
          </h2>
          <p className="vp-section-note">{t('packages.subtitle')}</p>
        </div>

        {data && state ? (
          <>
            <Notice state={state} />
            <ul aria-label={t('packages.listLabel')} className="vp-packages">
              {data.packages.map((pack, index) => (
                <PackageCard
                  key={pack.id}
                  pack={pack}
                  packages={data.packages}
                  best={pack.id === best}
                  state={state}
                  index={index}
                />
              ))}
            </ul>
          </>
        ) : (
          <div data-testid="vip-unavailable">
            <EmptyState
              icon={RefreshCWIcon}
              title={t('packages.unavailable')}
              body={t('packages.unavailableBody')}
            />
          </div>
        )}
      </section>

      <Compare />

      <section aria-labelledby="vip-how" className="vp-section">
        <h2 id="vip-how" className="v-title">
          {t('how.title')}
        </h2>
        <ul className="vp-how">
          <li>{t('how.once')}</li>
          <li>{t('how.starts')}</li>
          <li>{t('how.payer')}</li>
          <li>
            {t('how.refund', { days: REFUND_WINDOW_DAYS })}{' '}
            <Link href={'/reembolso' as Route}>{t('how.refundLink')}</Link>
          </li>
          <li>
            {t('how.ban')} <Link href={'/termos' as Route}>{t('how.termsLink')}</Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

/** O porquê de os botões estarem parados (cobrança desligada, ou o motivo desta Conta); nada quando se pode comprar. */
async function Notice({ state }: { state: NonNullable<ReturnType<typeof buyState>> }) {
  const t = await getTranslations('vip.notices');
  if (state.kind === 'buy' || state.kind === 'signin') return null;
  const key = state.kind === 'soon' ? 'soon' : state.reason;
  return (
    <p role="status" className="vp-notice" data-testid="vip-notice-reason" data-reason={key}>
      {t(key)}{' '}
      {state.kind === 'blocked' &&
      (state.reason === 'purchase_in_progress' || state.reason === 'daily_limit') ? (
        <Link href={'/configuracoes/compras' as Route} prefetch={false}>
          {t('myPurchases')}
        </Link>
      ) : null}
    </p>
  );
}
