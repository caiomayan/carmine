'use client';

import type { StaffPaymentPage, StaffPaymentSummary } from '@carmine/contracts';
import { staffPaymentPageSchema } from '@carmine/contracts/staff-payments';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { formatBrl, formatDateTime, monthsOf, shortId, statusTone } from '@/lib/purchases';
import { FieldError } from './fields';

/** Os pagamentos de um estado, do mais recente ao mais antigo, de página em página (cursor `before`). */
export function PaymentList({ initial, filter }: { initial: StaffPaymentPage; filter: string }) {
  const t = useTranslations('staff.payments');
  const [payments, setPayments] = useState<StaffPaymentSummary[]>(initial.payments);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/staff/payments?${new URLSearchParams({ status: filter, before: cursor })}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(String(response.status));
      const page = staffPaymentPageSchema.parse(await response.json());
      setPayments((current) => [...current, ...page.payments]);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (payments.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground" data-testid="payments-empty">
        {t('list.empty')}
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <ol className="grid gap-1.5" data-testid="payment-list">
        {payments.map((payment) => (
          <li key={payment.id}>
            <PaymentRow payment={payment} />
          </li>
        ))}
      </ol>
      {cursor ? (
        <div className="grid justify-items-start gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={loading}
            aria-busy={loading || undefined}
            onClick={loadMore}
            data-testid="payments-more"
          >
            {loading ? t('list.loading') : t('list.more')}
          </Button>
          {failed ? (
            <div role="alert">
              <FieldError>{t('list.loadFailed')}</FieldError>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PaymentRow({ payment }: { payment: StaffPaymentSummary }) {
  const t = useTranslations('staff.payments');
  return (
    <Link
      href={`/staff/pagamentos/${payment.id}` as Route}
      data-testid="payment-row"
      data-status={payment.status}
      data-payment-id={payment.id}
      aria-label={`${t('list.open')}: ${shortId(payment.id)}`}
      className="grid gap-x-4 gap-y-1 rounded-lg bg-(--fill-rest) px-4 py-3 transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover) sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center motion-reduce:transition-none"
    >
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <StatusDot tone={statusTone(payment.status)} />
          {t(`status.${payment.status}`)}
        </span>
        <span className="truncate text-sm">{payment.account.displayName}</span>
        <span className="text-caption text-muted-foreground tabular-nums">
          {shortId(payment.id)}
        </span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-body-sm text-muted-foreground sm:justify-end">
        {payment.account.purchasesBlocked ? (
          <span className="font-semibold text-foreground">{t('list.blocked')}</span>
        ) : null}
        {payment.refundedCents > 0 ? (
          <span className="tabular-nums">
            {t('list.refunded', { amount: formatBrl(payment.refundedCents) })}
          </span>
        ) : null}
        <span>
          {t('list.package', { months: monthsOf(payment) })} · {t(`method.${payment.method}`)}
        </span>
        <span className="font-semibold text-foreground tabular-nums">
          {formatBrl(payment.amountCents)}
        </span>
        <time dateTime={payment.createdAt} className="tabular-nums">
          {formatDateTime(payment.createdAt)}
        </time>
      </span>
    </Link>
  );
}
