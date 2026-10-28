import type { Purchase } from '@carmine/contracts/payments';
import type { Route } from 'next';
import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { PageHead } from '@/components/page-head';
import { PurchaseStatus } from './purchase-status';
import '@/app/vip/purchase.css';

/**
 * A página de uma compra (S14b): o título, o aviso de ambiente de teste (provedor falso) e o estado da compra. A rota
 * `/vip/compra/[id]` entrega a compra lida da API; a vitrine `/dev/vip/compra`, dados de exemplo e o `poll` desligado.
 */
export async function PurchasePage({
  purchase,
  returnedFromCard,
  poll = true,
  nowMs = Date.now(),
}: {
  purchase: Purchase;
  returnedFromCard: boolean;
  poll?: boolean;
  nowMs?: number;
}) {
  const t = await getTranslations('vip.purchase');
  const tc = await getTranslations('vip.confirm');
  const messages = await getMessages();
  return (
    <div className="container-page pb-24" data-testid="vip-purchase-page">
      <PageHead title={t('metaTitle')} />
      {purchase.simulationUrl ? (
        <aside role="note" className="vs-sandbox" data-testid="vip-sandbox">
          <span>{t('sandbox')}</span>
        </aside>
      ) : null}
      <NextIntlClientProvider messages={{ vip: { purchase: messages.vip.purchase } }}>
        <PurchaseStatus
          initial={purchase}
          returnedFromCard={returnedFromCard}
          poll={poll}
          nowMs={nowMs}
        />
      </NextIntlClientProvider>
      <p className="vc-back mt-8">
        <Link href={'/vip' as Route}>{tc('back')}</Link>
      </p>
    </div>
  );
}
