import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmView } from '@/components/vip/confirm-view';
import { packageFromParam } from '@/lib/vip/purchase';
import {
  CONFIRM_STATE_LABEL,
  CONFIRM_STATES,
  confirmFixture,
  FIXTURE_ACCOUNT,
  isConfirmState,
} from '@/lib/vip/purchase-fixtures';

// Vitrine: só existe com CARMINE_UI_GALLERY=1 (dev local e homologação).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Confirmar compra (vitrine)', robots: { index: false } };

/** `/dev/vip/comprar?estado=padrao|vip-ativo|horizonte|banido|bloqueado|em-analise|limite&pacote=vip-3m`. */
export default async function ConfirmGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; pacote?: string }>;
}) {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  const { estado, pacote } = await searchParams;
  const state = isConfirmState(estado) ? estado : 'padrao';
  const pack = packageFromParam(pacote) ?? packageFromParam('vip-3m');
  if (!pack) notFound();
  const now = new Date();
  const { vipEndsAt, block } = confirmFixture(state, now.getTime());
  return (
    <>
      <nav
        aria-label="Estados da vitrine"
        className="container-page flex flex-wrap gap-1.5 pt-6 text-[13px] font-semibold"
        data-testid="vip-gallery-nav"
      >
        {CONFIRM_STATES.map((key) => (
          <Link
            key={key}
            href={`/dev/vip/comprar?estado=${key}&pacote=${pack.id}` as never}
            aria-current={key === state ? 'page' : undefined}
            className="rounded-full bg-(--fill-rest) px-3.5 py-2 transition-colors duration-(--dur-fast) hover:bg-[color-mix(in_srgb,var(--text)_13%,transparent)] aria-[current=page]:bg-foreground aria-[current=page]:text-background"
          >
            {CONFIRM_STATE_LABEL[key]}
          </Link>
        ))}
      </nav>
      <ConfirmView
        pack={pack}
        account={FIXTURE_ACCOUNT}
        vipEndsAt={vipEndsAt}
        block={block}
        now={now}
        demo
      />
    </>
  );
}
