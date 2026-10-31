import {
  PURCHASE_EXPIRES_MINUTES,
  type PurchaseEligibility,
  REFUND_WINDOW_DAYS,
  VIP_MAX_HORIZON_DAYS,
} from '@carmine/contracts/payments';
import type { Plan, PlanPackageItem } from '@carmine/contracts/plans';
import type { Route } from 'next';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getFormatter, getMessages, getTranslations } from 'next-intl/server';
import { Avatar } from '@/components/avatar';
import { PageHead } from '@/components/page-head';
import { formatBrl } from '@/lib/vip/packages';
import { exceedsHorizon, projectedVipEnd } from '@/lib/vip/purchase';
import { PurchaseForm } from './purchase-form';
import '@/app/plans/purchase.css';

export type ConfirmAccount = { displayName: string; avatarUrl: string | null; publicId: number };

/** Por que a compra não pode seguir (além do limite à frente, que a tela calcula): a API (`eligibility`) ou a cobrança desligada. */
export type ConfirmBlock = Exclude<PurchaseEligibility, 'ok'> | 'soon';

/**
 * A confirmação da compra (S14b): antes do pagamento, a Conta que recebe o VIP (avatar, nome, ID), o valor, a duração,
 * o novo fim do VIP, "pagamento único, sem renovação", o aviso do ban permanente sem reembolso (em destaque, como os
 * Termos de Uso pedem na seção 8) e a declaração de maioridade. Só apresenta: o `/plans/checkout` lê a sessão e a API; a
 * vitrine `/dev/vip/comprar` entrega dados de exemplo.
 *
 * O texto do aviso do ban e o da declaração seguem o rascunho dos Termos (docs/legal/termos-de-uso.md, seções 8 e 10) e
 * ficam [VALIDAR COM ADVOGADO] até o dono revisar; mexer neles muda a versão da declaração no contrato.
 */
export async function ConfirmView({
  pack,
  account,
  vipEndsAt,
  currentPlan = null,
  block,
  now,
  demo = false,
}: {
  pack: PlanPackageItem;
  account: ConfirmAccount;
  /** O fim do plano ativo da Conta (de tudo, com a fila); nulo se não tem plano ativo. */
  vipEndsAt: string | null;
  /** O plano ativo agora; nulo sem plano. Diz o que a troca faz (Padrinho sobre Capo, Capo sobre Padrinho). */
  currentPlan?: Plan | null;
  block: ConfirmBlock | null;
  now: Date;
  /** Vitrine: o formulário não chama a API. */
  demo?: boolean;
}) {
  const t = await getTranslations('vip.confirm');
  const tp = await getTranslations('vip.plans');
  const format = await getFormatter();
  const messages = await getMessages();
  const day = (date: Date | string) =>
    format.dateTime(new Date(date), { day: 'numeric', month: 'long', year: 'numeric' });

  const end = projectedVipEnd(vipEndsAt, pack.days, now);
  const overHorizon = exceedsHorizon(end, now);
  const price = formatBrl(pack.priceCents);
  const swap =
    pack.plan === 'padrinho' && currentPlan === 'capo'
      ? 'padrinhoOverCapo'
      : pack.plan === 'capo' && currentPlan === 'padrinho'
        ? 'capoOverPadrinho'
        : null;

  return (
    <div className="container-page pb-24" data-testid="vip-confirm">
      <PageHead title={t('title')} subtitle={t('subtitle')} />
      <p className="vc-back">
        <Link href={'/plans' as Route}>{t('back')}</Link>
      </p>

      <div className="vc">
        <div className="vc-col">
          <section
            aria-labelledby="vc-beneficiary"
            className="vc-card"
            data-testid="vip-beneficiary"
          >
            <h2 id="vc-beneficiary" className="v-label vc-label">
              {t('beneficiary.label')}
            </h2>
            <div className="vc-account">
              <Avatar src={account.avatarUrl} name={account.displayName} size={56} />
              <div className="vc-account-text">
                <p className="vc-account-name">{account.displayName}</p>
                <p className="vc-account-id tabular-nums">
                  {t('beneficiary.id', { id: account.publicId })}
                  <span aria-hidden="true"> · </span>
                  <Link href={`/${account.publicId}` as Route} prefetch={false}>
                    {t('beneficiary.profile')}
                  </Link>
                </p>
              </div>
            </div>
            <p className="vc-note">{t('beneficiary.note')}</p>
          </section>

          <section aria-labelledby="vc-summary" className="vc-card" data-testid="vip-summary">
            <h2 id="vc-summary" className="v-label vc-label">
              {t('summary.title')}
            </h2>
            <dl className="vc-rows">
              <div>
                <dt>{t('summary.package')}</dt>
                <dd>{t('summary.packageValue', { plan: tp(pack.plan), months: pack.months })}</dd>
              </div>
              <div>
                <dt>{t('summary.duration')}</dt>
                <dd className="tabular-nums">{t('summary.durationValue', { days: pack.days })}</dd>
              </div>
              <div>
                <dt>{t('summary.price')}</dt>
                <dd className="vc-price v-serif tabular-nums" data-testid="vip-confirm-price">
                  {price}
                </dd>
              </div>
              <div>
                <dt>{t('summary.newEnd')}</dt>
                <dd data-testid="vip-new-end">{day(end)}</dd>
              </div>
            </dl>
            <p className="vc-note">
              {vipEndsAt ? `${t('summary.adds', { date: day(vipEndsAt) })} ` : ''}
              {t('summary.starts')}
            </p>
            {swap ? (
              <p className="vc-note" data-testid="vip-swap" data-swap={swap}>
                {t(`summary.${swap}`)}
              </p>
            ) : null}
            <p className="vc-once">{t('summary.once')}</p>
          </section>
        </div>

        <div className="vc-col">
          <aside
            role="note"
            aria-labelledby="vc-ban"
            className="vc-ban"
            data-testid="vip-ban-notice"
          >
            <h2 id="vc-ban" className="vc-ban-title">
              {t('ban.title')}
            </h2>
            <p>{t('ban.body')}</p>
            <p className="vc-ban-refund">
              {t('ban.refund', { days: REFUND_WINDOW_DAYS })}{' '}
              <Link href={'/terms' as Route}>{t('ban.terms')}</Link>
            </p>
          </aside>

          {block ? (
            <section
              className="vc-card vc-stop"
              role="status"
              data-testid="vip-confirm-blocked"
              data-reason={block}
            >
              <h2 className="vc-stop-title">{t('blocked.title')}</h2>
              <p>{t(`blocked.${block}`)}</p>
              {block === 'purchase_in_progress' || block === 'daily_limit' ? (
                <p>
                  <Link href={'/settings/purchases' as Route} prefetch={false}>
                    {t('blocked.myPurchases')}
                  </Link>
                </p>
              ) : null}
            </section>
          ) : overHorizon ? (
            <section className="vc-card vc-stop" role="status" data-testid="vip-confirm-horizon">
              <h2 className="vc-stop-title">{t('horizon.title')}</h2>
              <p>{t('horizon.body', { days: VIP_MAX_HORIZON_DAYS })}</p>
              <p>
                <Link href={'/plans' as Route}>{t('horizon.back')}</Link>
              </p>
            </section>
          ) : (
            <NextIntlClientProvider messages={{ vip: { confirm: messages.vip.confirm } }}>
              <PurchaseForm
                packageId={pack.id}
                price={price}
                expiresMinutes={PURCHASE_EXPIRES_MINUTES}
                demo={demo}
              />
            </NextIntlClientProvider>
          )}
        </div>
      </div>
    </div>
  );
}
