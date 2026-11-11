import type { VipStatus } from '@carmine/contracts';
import { REFUND_WINDOW_DAYS, type VipPackages } from '@carmine/contracts/payments';
import { type Plan, presetLimitFor } from '@carmine/contracts/plans';
import type { Route } from 'next';
import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { RefreshCWIcon } from '@/components/icons/animated/refresh-cw';
import { VipNotice } from '@/components/loadout/vip-notice';
import { bestValueId, buyState, packagesByPlan } from '@/lib/vip/packages';
import { Compare } from './compare';
import { PackageCard } from './package-card';
import '@/app/plans/vip.css';

/**
 * A página dos planos (S14b, S20): o que é grátis, o que é Capo e o que é Padrinho, os Pacotes de cada plano e como a
 * compra funciona. Só apresenta: os Pacotes e o estado da compra (aberta, "Em breve", se esta Conta pode comprar) vêm da
 * API (`packages`) e o plano da Conta, da sessão (`vip`); nada de preço escrito à mão. A confirmação da compra é outra
 * página (`/plans/checkout`). Na compra de teste do beta (provedor falso) o aviso fixo aparece no topo. A vitrine
 * `/dev/vip` mostra cada estado com dados de exemplo.
 */
export async function VipView({
  packages,
  vip,
  holdDays = null,
}: {
  packages: VipPackages | null;
  vip: VipStatus | null;
  /** `vipHoldDays` da sessão: nulo com a guarda dos Itens exclusivos desligada. */
  holdDays?: number | null;
}) {
  const t = await getTranslations('vip');
  const format = await getFormatter();
  const day = (iso: string) => format.dateTime(new Date(iso), { day: 'numeric', month: 'long' });

  const data = packages;
  const state = data ? buyState(data) : null;
  const groups = data ? packagesByPlan(data) : [];
  const plan: Plan = vip?.plan ?? 'capo';
  // O Padrinho com o Capo guardado depois: o plano de agora acaba antes do fim de tudo.
  const comesBack =
    vip?.plan === 'padrinho' && vip.planEndsAt && vip.endsAt && vip.planEndsAt < vip.endsAt;

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
          <i className="vp-slot vp-slot-vip">{t('slotLabel')}</i>
        </div>
      </header>

      {data?.sandbox ? (
        <aside role="note" className="vp-sandbox" data-testid="vip-sandbox">
          <b>{t('betaNotice')}</b>
        </aside>
      ) : null}

      {vip?.active && vip.endsAt ? (
        <div className="vp-yours" data-testid="vip-yours" data-plan={plan}>
          <p className="vp-yours-title">
            {t('yours.active', {
              plan: t(`plans.${plan}`),
              date: day(comesBack ? (vip.planEndsAt as string) : vip.endsAt),
            })}
          </p>
          {comesBack ? (
            <p data-testid="vip-yours-next">
              {t('yours.next', { plan: t('plans.capo'), date: day(vip.endsAt) })}
            </p>
          ) : null}
          <p>{t('yours.activeBody')}</p>
          <VipNotice vip={vip} holdDays={holdDays} className="mt-1" />
        </div>
      ) : vip?.endedAt ? (
        <div className="vp-yours" data-testid="vip-yours">
          <p className="vp-yours-title">{t('yours.ended', { date: day(vip.endedAt) })}</p>
          <p>
            {holdDays === null
              ? t('yours.endedBody')
              : t('yours.endedBodyHeld', { days: holdDays })}
          </p>
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
            {groups.map(({ plan: groupPlan, packages: list }) => {
              const best = bestValueId(list);
              return (
                <div
                  key={groupPlan}
                  className="vp-plan-group"
                  data-testid="vip-plan-group"
                  data-plan={groupPlan}
                >
                  <div className="vp-plan-group-head">
                    <h3 className="vp-plan-group-name">{t(`plans.${groupPlan}`)}</h3>
                    <p className="vp-plan-group-lead">
                      {t(`packages.planLead.${groupPlan}`, { presets: presetLimitFor(groupPlan) })}
                    </p>
                  </div>
                  <ul
                    aria-label={t('packages.listLabel', { plan: t(`plans.${groupPlan}`) })}
                    className="vp-packages"
                  >
                    {list.map((pack, index) => (
                      <PackageCard
                        key={pack.id}
                        pack={pack}
                        packages={list}
                        best={pack.id === best}
                        state={state}
                        index={index}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
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
          <li>{t('how.swap')}</li>
          <li>{t('how.payer')}</li>
          <li>
            {t('how.refund', { days: REFUND_WINDOW_DAYS })}{' '}
            <Link href={'/refunds' as Route}>{t('how.refundLink')}</Link>
          </li>
          <li>
            {t('how.ban')} <Link href={'/terms' as Route}>{t('how.termsLink')}</Link>
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
        <Link href={'/settings/purchases' as Route} prefetch={false}>
          {t('myPurchases')}
        </Link>
      ) : null}
    </p>
  );
}
