'use client';

import type { StaffPaymentDetail } from '@carmine/contracts';
import {
  staffPaymentDetailSchema,
  staffPurchasesUnblockedSchema,
} from '@carmine/contracts/staff-payments';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useId, useState } from 'react';
import { ArrowLeftIcon } from '@/components/icons/animated/arrow-left';
import { SectionTitle } from '@/components/section-title';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { LabelInput } from '@/components/ui/label-input';
import { formatBrl, formatDateTime, monthsOf, shortId, statusTone } from '@/lib/purchases';
import { ActionForm } from './action-form';
import { useStaffRequest } from './use-staff-request';

const link =
  'font-semibold underline decoration-line-strong underline-offset-(--underline-offset) hover:decoration-foreground';

/**
 * A ficha de um pagamento: o resumo, a Conta e o Pagador, o provedor, os webhooks recebidos e o que a
 * Staff já fez; reembolsar (total ou por dias) e reabrir as compras de uma Conta bloqueada por
 * contestação. Cada ação devolve a ficha atualizada.
 */
export function PaymentSheet({ initial }: { initial: StaffPaymentDetail }) {
  const [detail, setDetail] = useState(initial);
  const t = useTranslations('staff.payments');
  const { payment } = detail;
  const none = t('sheet.none');
  const date = (iso: string | null) => (iso ? formatDateTime(iso) : none);

  const reload = async () => {
    try {
      const response = await fetch(`/api/staff/payments/${payment.id}`, { cache: 'no-store' });
      if (response.ok) setDetail(staffPaymentDetailSchema.parse(await response.json()));
    } catch {
      // A ação já deu certo; a ficha atualiza na próxima visita.
    }
  };

  return (
    <div className="grid gap-8" data-testid="payment-sheet" data-payment-id={payment.id}>
      <div className="animate-fade-up">
        <Button asChild variant="quiet" size="sm" className="-ml-3" data-icon-trigger>
          <Link href={'/staff/pagamentos' as Route}>
            <ArrowLeftIcon size={14} />
            {t('sheet.back')}
          </Link>
        </Button>
        <h2 className="mt-2 text-lg font-semibold">
          {t('sheet.title', { id: shortId(payment.id) })}
        </h2>
        <p className="mt-1 flex items-center gap-2 text-sm" data-testid="payment-status">
          <StatusDot tone={statusTone(payment.status)} />
          <span className="font-semibold">{t(`status.${payment.status}`)}</span>
          <span className="text-muted-foreground tabular-nums">{payment.id}</span>
        </p>
      </div>

      <div className="grid animate-fade-up gap-8 [animation-delay:60ms] lg:grid-cols-2">
        <Panel id="resumo" title={t('sheet.summary')}>
          <Facts
            rows={[
              [t('sheet.amount'), formatBrl(payment.amountCents)],
              [
                t('sheet.package'),
                `${t('list.package', { months: monthsOf(payment) })} (${payment.package})`,
              ],
              [t('sheet.method'), t(`method.${payment.method}`)],
              [t('sheet.createdAt'), date(payment.createdAt)],
              [t('sheet.approvedAt'), date(payment.approvedAt)],
              [
                t('sheet.refunded'),
                payment.refundedCents > 0
                  ? `${formatBrl(payment.refundedCents)} (${detail.refundedDays} d)`
                  : none,
              ],
              ...(detail.chargedBackAt
                ? [[t('sheet.chargedBackAt'), date(detail.chargedBackAt)]]
                : []),
              [t('sheet.vipEndsAt'), date(detail.vipEndsAt)],
            ]}
          />
        </Panel>
        <Panel id="conta" title={t('sheet.account')}>
          <p className="text-sm">
            <Link
              href={`/staff/contas/${payment.account.publicId}` as Route}
              className={link}
              data-testid="payment-account"
            >
              {payment.account.displayName}
            </Link>
          </p>
          <Facts
            rows={[
              [t('sheet.payerName'), payment.payerName ?? none],
              [t('sheet.payerDocument'), payment.payerDocumentMasked ?? none],
              [
                t('sheet.declared'),
                t('sheet.declaredValue', {
                  date: formatDateTime(detail.adultDeclaredAt),
                  version: detail.declarationVersion,
                }),
              ],
            ]}
          />
        </Panel>
        <Panel id="provedor" title={t('sheet.provider')}>
          <Facts
            rows={[
              [t('sheet.providerName'), payment.provider],
              [t('sheet.providerPaymentId'), detail.providerPaymentId ?? none],
              [t('sheet.expiresAt'), date(detail.expiresAt)],
              ...(detail.failureReason ? [[t('sheet.failure'), detail.failureReason]] : []),
            ]}
          />
        </Panel>
        <Panel id="reembolso" title={t('sheet.refund.title')}>
          <Refund detail={detail} onChange={setDetail} />
        </Panel>
      </div>

      <Unblock detail={detail} onDone={reload} />

      <Panel id="webhooks" title={t('sheet.events.title')}>
        {detail.events.length === 0 ? (
          <p className="text-body-sm text-muted-foreground" data-testid="events-empty">
            {t('sheet.events.empty')}
          </p>
        ) : (
          <ol className="grid" data-testid="payment-events">
            {detail.events.map((event) => (
              <li
                key={event.id}
                data-outcome={event.outcome}
                className="grid gap-0.5 border-b border-line/60 py-2.5 text-body-sm last:border-b-0"
              >
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">
                    <EventOutcome outcome={event.outcome} />
                  </span>
                  <span className="text-muted-foreground">{event.topic ?? none}</span>
                  <span className="text-muted-foreground">
                    {t('sheet.events.signature')}:{' '}
                    {event.signatureValid
                      ? t('sheet.events.signatureValid')
                      : t('sheet.events.signatureInvalid')}
                  </span>
                </p>
                <p className="text-caption text-muted-foreground tabular-nums">
                  {formatDateTime(event.receivedAt)}
                  {event.detail ? ` · ${event.detail}` : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <Panel id="auditoria" title={t('sheet.audit.title')}>
        {detail.audit.length === 0 ? (
          <p className="text-body-sm text-muted-foreground" data-testid="payment-audit-empty">
            {t('sheet.audit.empty')}
          </p>
        ) : (
          <ol className="grid" data-testid="payment-audit">
            {detail.audit.map((entry) => (
              <li
                key={entry.id}
                data-action={entry.action}
                className="grid gap-0.5 border-b border-line/60 py-2.5 text-body-sm last:border-b-0"
              >
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">{entry.actorName ?? entry.actorSteamId}</span>
                  <AuditAction action={entry.action} />
                </p>
                <p className="text-muted-foreground">{entry.reason}</p>
                <p className="text-caption text-muted-foreground tabular-nums">
                  {formatDateTime(entry.createdAt)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

const OUTCOMES = [
  'applied',
  'unchanged',
  'ignored',
  'invalid_signature',
  'mismatch',
  'error',
] as const;
const ACTIONS = ['payment_refund', 'purchase_unblock', 'vip_compensation'] as const;

const isOneOf = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);

/** O que a API fez com o webhook; um desfecho novo aparece como veio. */
function EventOutcome({ outcome }: { outcome: string }) {
  const t = useTranslations('staff.payments.sheet.events.outcomes');
  return <>{isOneOf(OUTCOMES, outcome) ? t(outcome) : outcome}</>;
}

function AuditAction({ action }: { action: string }) {
  const t = useTranslations('staff.audit.actions');
  return <span>{isOneOf(ACTIONS, action) ? t(action) : action}</span>;
}

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid content-start gap-2">
      <SectionTitle id={id}>{title}</SectionTitle>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: (readonly [string, string])[] | string[][] }) {
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-body-sm sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Refund({
  detail,
  onChange,
}: {
  detail: StaffPaymentDetail;
  onChange: (detail: StaffPaymentDetail) => void;
}) {
  const t = useTranslations('staff.payments.sheet.refund');
  const errors = useTranslations('staff.errors');
  const { request } = useStaffRequest();
  const id = useId();
  const [days, setDays] = useState('');
  const { refundable } = detail;

  if (!refundable) {
    return (
      <p className="text-body-sm text-muted-foreground" data-testid="refund-unavailable">
        {t('unavailable')}
      </p>
    );
  }

  const daysValue = days.trim() === '' ? undefined : Number(days);
  return (
    <div className="grid gap-2" data-testid="refund-panel">
      <p className="text-body-sm text-muted-foreground">{t('hint')}</p>
      <p className="text-body-sm font-semibold tabular-nums" data-testid="refundable">
        {t('remaining', { days: refundable.days, amount: formatBrl(refundable.cents) })}
      </p>
      <ActionForm
        collapsed
        variant="primary"
        label={t('open')}
        submitLabel={t('submit')}
        doneLabel={t('done')}
        testId="refund-form"
        validate={() =>
          daysValue === undefined ||
          (Number.isInteger(daysValue) && daysValue >= 1 && daysValue <= refundable.days)
            ? null
            : errors('invalid_body')
        }
        confirmation={{
          title: t('confirmTitle'),
          description: t('confirmBody'),
          confirmLabel: t('confirm'),
        }}
        onSubmit={async (reason) => {
          const result = await request(
            `/api/staff/payments/${detail.payment.id}/refund`,
            'POST',
            { reason, ...(daysValue !== undefined && { days: daysValue }) },
            staffPaymentDetailSchema,
          );
          if (result.ok) {
            setDays('');
            onChange(result.data);
          }
          return result;
        }}
      >
        <LabelInput
          id={`${id}-days`}
          label={t('days')}
          hint={t('daysHint')}
          type="number"
          inputMode="numeric"
          min={1}
          max={refundable.days}
          value={days}
          onChange={(event) => setDays(event.target.value)}
          containerClassName="w-48"
          className="tabular-nums"
        />
      </ActionForm>
    </div>
  );
}

function Unblock({ detail, onDone }: { detail: StaffPaymentDetail; onDone: () => Promise<void> }) {
  const t = useTranslations('staff.payments.sheet.unblock');
  const { request } = useStaffRequest();
  const { purchaseBlock } = detail;
  if (!purchaseBlock) return null;

  return (
    <Panel id="bloqueio" title={t('title')}>
      <div className="grid max-w-xl gap-2" data-testid="unblock-panel">
        <p className="text-body-sm">{t('body', { date: formatDateTime(purchaseBlock.at) })}</p>
        {purchaseBlock.reason ? (
          <p className="text-body-sm text-muted-foreground">
            {t('reason', { reason: purchaseBlock.reason })}
          </p>
        ) : null}
        <ActionForm
          collapsed
          variant="primary"
          label={t('open')}
          submitLabel={t('submit')}
          doneLabel={t('done')}
          testId="unblock-form"
          onSubmit={async (reason) => {
            const result = await request(
              `/api/staff/accounts/${detail.payment.account.publicId}/purchases/unblock`,
              'POST',
              { reason },
              staffPurchasesUnblockedSchema,
            );
            if (result.ok) await onDone();
            return result;
          }}
        />
      </div>
    </Panel>
  );
}
