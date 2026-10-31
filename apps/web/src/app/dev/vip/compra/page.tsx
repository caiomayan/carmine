import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PurchasePage } from '@/components/vip/purchase-page';
import {
  isPurchaseState,
  PURCHASE_STATE_LABEL,
  PURCHASE_STATES,
  purchaseFixture,
} from '@/lib/vip/purchase-fixtures';

// Vitrine: só existe com CARMINE_UI_GALLERY=1 (dev local e homologação).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Compra do VIP (vitrine)', robots: { index: false } };

/** `/dev/vip/compra?estado=pix|pix-sem-qr|pix-vencido|cartao|cartao-volta|processando|em-analise|aprovada|...`; sem polling. */
export default async function PurchaseGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  const { estado } = await searchParams;
  const state = isPurchaseState(estado) ? estado : 'pix';
  const now = Date.now();
  const { purchase, returnedFromCard } = purchaseFixture(state, now);
  return (
    <>
      <nav
        aria-label="Estados da vitrine"
        className="container-page flex flex-wrap gap-1.5 pt-6 text-[13px] font-semibold"
        data-testid="vip-gallery-nav"
      >
        {PURCHASE_STATES.map((key) => (
          <Link
            key={key}
            href={`/dev/vip/compra?estado=${key}` as never}
            aria-current={key === state ? 'page' : undefined}
            className="rounded-full bg-(--fill-rest) px-3.5 py-2 transition-colors duration-(--dur-fast) hover:bg-[color-mix(in_srgb,var(--text)_13%,transparent)] aria-[current=page]:bg-foreground aria-[current=page]:text-background"
          >
            {PURCHASE_STATE_LABEL[key]}
          </Link>
        ))}
      </nav>
      <PurchasePage
        purchase={purchase}
        returnedFromCard={returnedFromCard}
        poll={false}
        nowMs={now}
      />
    </>
  );
}
