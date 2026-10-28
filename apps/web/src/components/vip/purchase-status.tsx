'use client';

import { type Purchase, purchaseSchema, VIP_PACKAGES } from '@carmine/contracts/payments';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DynamicButton } from '@/components/vida/dynamic-button';
import { useVisibleInterval } from '@/hooks/use-visible-interval';
import { formatBrl } from '@/lib/vip/packages';
import {
  formatClock,
  isOpen,
  msUntilExpiry,
  type PurchaseView,
  purchaseView,
} from '@/lib/vip/purchase';

const POLL_MS = 4000;

/**
 * Só endereços http(s) (ou caminhos do próprio site) viram link: a resposta da API nunca entrega `javascript:` ao
 * navegador. Não usa `window`: roda igual no servidor e no cliente (senão a hidratação diverge).
 */
function safeHref(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, 'http://localhost');
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : null;
  } catch {
    return null;
  }
}

/**
 * A página da compra (S14b): o Pix para pagar (QR em PNG da API e copia e cola), o checkout do cartão, "processando",
 * "em análise" e os estados finais. Enquanto a compra pode mudar, pergunta à API a cada poucos segundos (a API consulta
 * o provedor, sem esperar o webhook). Quem volta do cartão (`?retorno=cartao`) cai aqui, e a tela decide pelo estado da
 * compra, nunca pelo parâmetro. A tela só tem dados da própria Conta; a vitrine `/dev/vip/compra` desliga o `poll`.
 */
export function PurchaseStatus({
  initial,
  returnedFromCard,
  poll = true,
  nowMs,
}: {
  initial: Purchase;
  returnedFromCard: boolean;
  poll?: boolean;
  /** O "agora" do servidor: o relógio do Pix nasce igual no servidor e no cliente (sem erro de hidratação). */
  nowMs: number;
}) {
  const t = useTranslations('vip.purchase');
  const format = useFormatter();
  const [purchase, setPurchase] = useState(initial);
  const [now, setNow] = useState(() => new Date(nowMs));
  const [pollFailed, setPollFailed] = useState(false);

  const open = isOpen(purchase.status);

  // O relógio do Pix (e o limite do "processando") anda de 1 em 1 segundo enquanto a compra está aberta e a aba à
  // vista; ao voltar (por exemplo, do app do banco no celular), atualiza na hora.
  useVisibleInterval(() => setNow(new Date()), open && poll ? 1000 : null);

  // A releitura da compra também só corre com a aba à vista e, ao voltar, relê na hora: é o momento em que quem pagou
  // no app do banco quer ver a confirmação.
  const stopped = useRef(false);
  const id = purchase.id;
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, [id, open, poll]);
  const refresh = async () => {
    try {
      const response = await fetch(`/api/me/purchases/${id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const parsed = purchaseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('shape');
      if (!stopped.current) {
        setPurchase(parsed.data);
        setPollFailed(false);
      }
    } catch {
      if (!stopped.current) setPollFailed(true);
    }
  };
  useVisibleInterval(refresh, open && poll ? POLL_MS : null);

  const view = purchaseView(purchase, returnedFromCard, now);
  const day = (iso: string) =>
    format.dateTime(new Date(iso), { day: 'numeric', month: 'long', year: 'numeric' });
  const price = formatBrl(purchase.amountCents);

  return (
    <div className="vs" data-testid="vip-purchase" data-status={purchase.status} data-view={view}>
      <p className="vs-summary">
        {t('summary', {
          package: t('packageName', { months: monthsOf(purchase) }),
          price,
        })}
      </p>

      <section aria-live="polite" aria-label={t('statusLabel')} className="vs-stage">
        {view === 'waiting' && purchase.method === 'pix' ? (
          <PixWaiting purchase={purchase} now={now} />
        ) : view === 'waiting' ? (
          <CardWaiting purchase={purchase} now={now} returned={returnedFromCard} />
        ) : (
          <Outcome view={view} purchase={purchase} day={day} />
        )}
        {view === 'waiting' && poll ? <p className="vs-checking">{t('waiting.checking')}</p> : null}
        {pollFailed && open ? (
          <p className="vs-checking" data-testid="vip-poll-failed">
            {t('poll.failed')}
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** Os meses do Pacote da compra (o nome "VIP, 3 meses"). */
function monthsOf(purchase: Purchase) {
  return VIP_PACKAGES.find((pack) => pack.id === purchase.package)?.months ?? 1;
}

function PixWaiting({ purchase, now }: { purchase: Purchase; now: Date }) {
  const t = useTranslations('vip.purchase.waiting');
  const left = msUntilExpiry(purchase.expiresAt, now);
  const qr = purchase.pix?.qrCodeBase64 ?? null;
  const simulation = safeHref(purchase.simulationUrl);

  return (
    <div className="vs-pix" data-testid="vip-pix">
      <div className="vs-pix-main">
        <h2 className="vs-title">{t('pix.title')}</h2>
        <p className="vs-body">{t('pix.body')}</p>
        {purchase.pix ? (
          <div className="vs-code">
            <label htmlFor="vip-pix-code" className="v-label">
              {t('pix.code')}
            </label>
            <textarea
              id="vip-pix-code"
              readOnly
              rows={3}
              value={purchase.pix.copyPaste}
              className="vs-code-box"
              data-testid="vip-pix-code"
              onFocus={(event) => event.currentTarget.select()}
            />
            <DynamicButton
              idle={t('pix.copy')}
              loading={t('pix.copying')}
              done={t('pix.copied')}
              copyText={purchase.pix.copyPaste}
              loadingMs={500}
              testId="vip-pix-copy"
            />
          </div>
        ) : null}
        {left === null ? null : left > 0 ? (
          <p className="vs-clock" data-testid="vip-pix-clock">
            {t('pix.expires', { clock: formatClock(left) })}
          </p>
        ) : (
          <p className="vs-clock" data-testid="vip-pix-expired">
            {t('pix.expiredLocal')}
          </p>
        )}
        {simulation ? (
          <p className="vs-sim">
            <a href={simulation} data-testid="vip-simulate">
              {t('simulate')}
            </a>
          </p>
        ) : null}
      </div>
      {qr ? (
        <div className="vs-qr">
          {/* O QR vem em PNG da API: <img> com data URI, sem biblioteca de QR no navegador. */}
          {/* biome-ignore lint/performance/noImgElement: data URI; o next/image não ajuda */}
          <img
            src={`data:image/png;base64,${qr}`}
            alt={t('pix.qrAlt')}
            width={232}
            height={232}
            data-testid="vip-pix-qr"
          />
        </div>
      ) : null}
    </div>
  );
}

function CardWaiting({
  purchase,
  now,
  returned,
}: {
  purchase: Purchase;
  now: Date;
  returned: boolean;
}) {
  const t = useTranslations('vip.purchase.waiting');
  const left = msUntilExpiry(purchase.expiresAt, now);
  const checkout = safeHref(purchase.redirectUrl);
  const simulation = safeHref(purchase.simulationUrl);

  return (
    <div data-testid="vip-card">
      <h2 className="vs-title">{t('card.title')}</h2>
      <p className="vs-body">{returned ? t('card.returned') : t('card.body')}</p>
      {checkout ? (
        <Button asChild className="vs-action">
          <a href={checkout} data-testid="vip-checkout">
            {t('card.continue')}
          </a>
        </Button>
      ) : null}
      {left !== null && left > 0 ? (
        <p className="vs-clock">{t('card.expires', { clock: formatClock(left) })}</p>
      ) : null}
      {simulation ? (
        <p className="vs-sim">
          <a href={simulation} data-testid="vip-simulate">
            {t('simulate')}
          </a>
        </p>
      ) : null}
    </div>
  );
}

/** As compras ficam em Minhas compras (de outra frente): sem prefetch, só abre quando a pessoa clica. */
const prefetchOf = (href: string) => (href.startsWith('/configuracoes') ? false : undefined);

function Outcome({
  view,
  purchase,
  day,
}: {
  view: Exclude<PurchaseView, 'waiting'>;
  purchase: Purchase;
  day: (iso: string) => string;
}) {
  const t = useTranslations('vip.purchase');
  const retryHref = view === 'refunded' ? '/vip' : `/vip/comprar?pacote=${purchase.package}`;
  const links: { href: string; text: string; primary?: boolean }[] = [];

  if (view === 'approved') {
    links.push({ href: '/loadout', text: t('approved.loadout'), primary: true });
    links.push({ href: '/configuracoes/compras', text: t('approved.receipt') });
  } else if (view === 'processing' || view === 'in_review' || view === 'partially_refunded') {
    links.push({ href: '/configuracoes/compras', text: t('processing.myPurchases') });
  } else if (
    view === 'rejected' ||
    view === 'expired' ||
    view === 'cancelled' ||
    view === 'refunded'
  ) {
    links.push({ href: retryHref, text: t(`${view}.retry`), primary: true });
  }

  return (
    <div data-testid="vip-outcome">
      <h2 className="vs-title" data-tone={view}>
        {t(`${view}.title`)}
      </h2>
      <p className="vs-body">{t(`${view}.body`)}</p>
      {view === 'approved' ? (
        <>
          {purchase.periodEndsAt ? (
            <p className="vs-until" data-testid="vip-until">
              {t('approved.until', { date: day(purchase.periodEndsAt) })}
            </p>
          ) : null}
          {purchase.refundableUntil ? (
            <p className="vs-clock">
              {t('approved.refundUntil', { date: day(purchase.refundableUntil) })}
            </p>
          ) : null}
        </>
      ) : null}
      {links.length > 0 ? (
        <p className="vs-links">
          {links.map((link) =>
            link.primary ? (
              <Button asChild key={link.href} className="vs-action">
                <Link href={link.href as Route} prefetch={prefetchOf(link.href)}>
                  {link.text}
                </Link>
              </Button>
            ) : (
              <Link
                key={link.href}
                href={link.href as Route}
                prefetch={prefetchOf(link.href)}
                className="vs-link"
              >
                {link.text}
              </Link>
            ),
          )}
        </p>
      ) : null}
    </div>
  );
}
