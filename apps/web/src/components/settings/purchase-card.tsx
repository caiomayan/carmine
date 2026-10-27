import type { Purchase } from '@carmine/contracts/payments';
import { PURCHASE_PROCESSING_MINUTES } from '@carmine/contracts/payments';
import type { Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import {
  canRefund,
  formatBrl,
  formatDate,
  formatDateTime,
  hasReceipt,
  isOpen,
  monthsOf,
  pixIsLive,
  shortId,
  statusTone,
  supportDue,
} from '@/lib/purchases';
import { CopyButton } from './copy-button';
import { PixPayment } from './pix-payment';
import { RefundAction } from './refund-action';

/**
 * Uma compra em "Minhas compras": o estado em palavras (a cor é só reforço), o valor, o que falta para
 * pagar (Pix recuperável, checkout do cartão, "processando" e o suporte depois de 10 minutos) e o que
 * dá para fazer (recibo, reembolso dentro dos 7 dias). Server Component: só o Pix, o reembolso e o
 * copiar são de cliente.
 */
export async function PurchaseCard({ purchase, now }: { purchase: Purchase; now: Date }) {
  const t = await getTranslations('settings.purchases');
  const open = isOpen(purchase.status);
  const support = supportDue(purchase, now);
  const note = noteFor(purchase);
  const titleId = `compra-${purchase.id}`;
  const live = pixIsLive(purchase, now);

  return (
    <article
      aria-labelledby={titleId}
      data-testid="purchase"
      data-status={purchase.status}
      data-purchase-id={purchase.id}
      className="grid gap-4 rounded-lg px-4 py-4 max-md:px-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
        <div className="grid gap-1">
          <span
            className="inline-flex items-center gap-2 text-body-sm font-semibold"
            data-testid="purchase-status"
          >
            <StatusDot tone={statusTone(purchase.status)} pulse={open} />
            {t(`status.${purchase.status}`)}
          </span>
          <h3 id={titleId} className="text-md font-semibold">
            {t('package', { months: monthsOf(purchase) })}
            <span className="font-normal text-muted-foreground">
              {' · '}
              {t(`method.${purchase.method}`)}
            </span>
          </h3>
        </div>
        <span className="text-md font-semibold tabular-nums" data-testid="purchase-amount">
          {formatBrl(purchase.amountCents)}
        </span>
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-body-sm text-muted-foreground">
        <span>{t('meta.createdAt', { date: formatDateTime(purchase.createdAt) })}</span>
        {purchase.approvedAt ? (
          <span>{t('meta.approvedAt', { date: formatDateTime(purchase.approvedAt) })}</span>
        ) : null}
        {purchase.periodEndsAt ? (
          <span data-testid="purchase-vip-until">
            {t('meta.vipUntil', { date: formatDate(purchase.periodEndsAt) })}
          </span>
        ) : null}
      </p>

      {note ? (
        <p className="text-body-sm" data-testid="purchase-note">
          {note.key === 'refunded' || note.key === 'partiallyRefunded'
            ? t(`notes.${note.key}`, { amount: formatBrl(purchase.refundedCents) })
            : t(`notes.${note.key}`)}
        </p>
      ) : null}

      {live && purchase.pix ? (
        <PixPayment
          code={purchase.pix.copyPaste}
          qrBase64={purchase.pix.qrCodeBase64}
          expiresAt={purchase.expiresAt}
        />
      ) : null}

      {purchase.status === 'pending' && purchase.redirectUrl ? (
        <div className="grid gap-2 rounded-lg bg-(--fill-rest) p-4">
          <p className="text-body-sm font-semibold">{t('card.title')}</p>
          <p className="text-body-sm text-muted-foreground">{t('card.hint')}</p>
          <div>
            <Button asChild size="sm">
              <a href={purchase.redirectUrl} data-testid="card-continue">
                {t('card.continue')}
              </a>
            </Button>
          </div>
        </div>
      ) : null}
      {purchase.status === 'in_review' ? (
        <p className="text-body-sm text-muted-foreground" data-testid="card-review">
          {t('card.review')}
        </p>
      ) : null}

      {open ? (
        support ? (
          <div
            className="grid gap-2 rounded-lg bg-(--fill-rest) p-4"
            data-testid="purchase-support"
          >
            <p className="text-body-sm font-semibold">
              {t('processing.supportTitle', { minutes: PURCHASE_PROCESSING_MINUTES })}
            </p>
            <p className="text-body-sm text-muted-foreground">{t('processing.support')}</p>
            <p className="font-mono text-caption select-all" data-testid="purchase-support-id">
              {purchase.id}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm">
                <Link href={'/contato' as Route}>{t('processing.contact')}</Link>
              </Button>
              <CopyButton
                text={purchase.id}
                label={t('processing.copyId')}
                copiedLabel={t('processing.idCopied')}
                failedLabel={t('pix.copyFailed')}
                testId="purchase-copy-id"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-0.5" data-testid="purchase-processing">
            <p className="text-body-sm font-semibold">{t('processing.title')}</p>
            <p className="max-w-[60ch] text-body-sm text-muted-foreground">
              {t('processing.body')}
            </p>
          </div>
        )
      ) : null}

      {purchase.simulationUrl && open ? (
        <div className="grid gap-1.5 rounded-lg bg-(--fill-rest) p-4">
          <p className="text-body-sm text-muted-foreground">{t('simulation.hint')}</p>
          <div>
            <Button asChild variant="ghost" size="sm">
              <a href={purchase.simulationUrl} data-testid="purchase-simulation">
                {t('simulation.open')}
              </a>
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {hasReceipt(purchase) ? (
          <Button asChild variant="ghost" size="sm">
            <Link
              href={`/configuracoes/compras/${purchase.id}` as Route}
              data-testid="purchase-receipt"
            >
              {t('receipt.link')}
            </Link>
          </Button>
        ) : null}
        {canRefund(purchase, now) && purchase.refundableUntil ? (
          <RefundAction
            id={purchase.id}
            amount={formatBrl(purchase.amountCents)}
            days={purchase.days}
            until={formatDate(purchase.refundableUntil)}
          />
        ) : null}
        <span
          className="ml-auto font-mono text-caption text-muted-foreground select-all"
          title={purchase.id}
          data-testid="purchase-id"
        >
          {t('meta.id', { id: shortId(purchase.id) })}
        </span>
      </div>
    </article>
  );
}

/** A frase de uma compra que terminou sem pagamento ou foi devolvida; nada para quem está em aberto ou paga. */
function noteFor(purchase: Purchase) {
  switch (purchase.status) {
    case 'expired':
      return { key: 'expired' } as const;
    case 'rejected':
      return { key: 'rejected' } as const;
    case 'cancelled':
      return { key: 'cancelled' } as const;
    case 'refunded':
      return { key: 'refunded' } as const;
    case 'partially_refunded':
      return { key: 'partiallyRefunded' } as const;
    case 'charged_back':
      return { key: 'chargedBack' } as const;
    default:
      return null;
  }
}
