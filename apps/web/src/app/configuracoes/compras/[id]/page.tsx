import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { BadgeAlertIcon } from '@/components/icons/animated/badge-alert';
import { FileTextIcon } from '@/components/icons/animated/file-text';
import { PrintButton } from '@/components/settings/print-button';
import { Button } from '@/components/ui/button';
import { getPurchase, getServerSession } from '@/lib/api-server';
import {
  formatBrl,
  formatDate,
  formatDateTime,
  hasReceipt,
  monthsOf,
  shortId,
} from '@/lib/purchases';
import { receiptSupplier } from '@/lib/receipt-supplier';
import { cn } from '@/lib/utils';
import '../receipt.css';

/**
 * O recibo de uma compra (S14b), em página imprimível e sem nota fiscal (o fornecedor é pessoa física;
 * ADR dos pagamentos, D7). O número é o identificador da compra. A identificação do fornecedor vem do
 * ambiente (`RECEIPT_SUPPLIER_*`) e, enquanto o dono não a informa, fica um bloco "a informar". Só existe
 * para compra aprovada (mesmo devolvida depois); a de outra Conta responde 404.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('settings');
  const [result, session] = await Promise.all([getPurchase(id), getServerSession()]);

  if (result.status === 'not-found') notFound();
  if (result.status !== 'ok') {
    return (
      <Block testId="receipt-unavailable">
        <EmptyState
          icon={BadgeAlertIcon}
          title={t('receipt.unavailable.title')}
          body={t('receipt.unavailable.body')}
          action={<BackLink label={t('receipt.back')} />}
        />
      </Block>
    );
  }
  const { purchase } = result;

  if (!hasReceipt(purchase)) {
    return (
      <Block testId="receipt-not-available">
        <EmptyState
          icon={FileTextIcon}
          title={t('receipt.notAvailable.title')}
          body={t('receipt.notAvailable.body')}
          action={<BackLink label={t('receipt.back')} />}
        />
      </Block>
    );
  }

  const supplier = receiptSupplier();
  const account = session.status === 'authenticated' ? session.session.account : null;
  const tp = await getTranslations('settings.purchases');

  return (
    <section aria-labelledby="recibo" className="animate-fade-up" data-testid="settings-recibo">
      <div className="mb-3 flex flex-wrap items-center gap-2" data-print-hide>
        <BackLink label={t('receipt.back')} />
        <PrintButton label={t('receipt.print')} />
      </div>

      <article
        className="receipt grid gap-6 rounded-xl bg-surface p-6 max-md:p-4"
        data-testid="receipt"
      >
        <div className="grid gap-1">
          <h2 id="recibo" className="text-lg font-semibold">
            {t('receipt.title')}
          </h2>
          <p className="font-mono text-body-sm select-all" data-testid="receipt-number">
            {t('receipt.number', { id: purchase.id })}
          </p>
          <p className="text-caption text-muted-foreground">{t('receipt.numberHint')}</p>
        </div>

        <Group title={t('receipt.supplier.title')}>
          {supplier.configured ? (
            <div className="grid gap-0.5 text-body-sm" data-testid="receipt-supplier">
              <span className="font-semibold">{supplier.name}</span>
              <span>{t('receipt.supplier.document', { document: supplier.document })}</span>
              <span>{supplier.address}</span>
            </div>
          ) : (
            <p
              className="text-body-sm text-muted-foreground"
              data-testid="receipt-supplier-placeholder"
            >
              {t('receipt.supplier.placeholder')}
            </p>
          )}
        </Group>

        <Group title={t('receipt.buyer.title')}>
          {account ? (
            <p className="text-body-sm" data-testid="receipt-buyer">
              <span className="font-semibold">{account.displayName}</span>
              {' · '}
              <Link
                href={`/${account.publicId}` as Route}
                className="underline underline-offset-2"
                data-print-hide
              >
                {t('receipt.buyer.profile')}
              </Link>
            </p>
          ) : null}
        </Group>

        <Group title={t('receipt.payer.title')}>
          <Line
            label={t('receipt.payer.name')}
            value={purchase.payerName ?? '—'}
            testId="receipt-payer"
          />
          <Line
            label={t('receipt.payer.document')}
            value={purchase.payerDocumentMasked ?? '—'}
            testId="receipt-payer-document"
          />
        </Group>

        <Group title={t('receipt.item.title')}>
          <Line
            label={t('receipt.item.package')}
            value={tp('package', { months: monthsOf(purchase) })}
          />
          <Line label={t('receipt.item.duration')} value={tp('days', { days: purchase.days })} />
          {purchase.periodEndsAt ? (
            <Line label={t('receipt.item.vipUntil')} value={formatDate(purchase.periodEndsAt)} />
          ) : null}
          <Line
            label={t('receipt.item.amount')}
            value={formatBrl(purchase.amountCents)}
            testId="receipt-amount"
            strong
          />
          <Line label={t('receipt.item.method')} value={tp(`method.${purchase.method}`)} />
          {purchase.approvedAt ? (
            <Line
              label={t('receipt.item.approvedAt')}
              value={formatDateTime(purchase.approvedAt)}
            />
          ) : null}
          <Line
            label={t('receipt.item.status')}
            value={tp(`status.${purchase.status}`)}
            testId="receipt-status"
          />
          {purchase.refundedCents > 0 ? (
            <Line
              label={t('receipt.item.refunded')}
              value={formatBrl(purchase.refundedCents)}
              testId="receipt-refunded"
            />
          ) : null}
        </Group>

        <div className="grid gap-1 text-caption text-muted-foreground">
          <p>{t('receipt.notes.once')}</p>
          <p data-testid="receipt-no-invoice">{t('receipt.notes.noInvoice')}</p>
          <p className="font-mono">{shortId(purchase.id)}</p>
        </div>
      </article>
    </section>
  );
}

function Block({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <section className="animate-fade-up rounded-xl bg-surface" data-testid={testId}>
      {children}
    </section>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href={'/configuracoes/compras' as Route} data-testid="receipt-back">
        {label}
      </Link>
    </Button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <h3 className="label-caps text-muted-foreground">{title}</h3>
      <div className="grid gap-1.5">{children}</div>
    </div>
  );
}

function Line({
  label,
  value,
  testId,
  strong = false,
}: {
  label: string;
  value: string;
  testId?: string;
  strong?: boolean;
}) {
  return (
    <div className="receipt-line text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums', strong && 'font-semibold')} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
