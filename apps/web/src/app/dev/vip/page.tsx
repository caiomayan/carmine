import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { VipView } from '@/components/vip/vip-view';
import { isVipState, VIP_STATE_LABEL, VIP_STATES, vipFixture } from '@/lib/vip/fixtures';

// Vitrine: como /dev/componentes, só existe com CARMINE_UI_GALLERY=1 (dev local e homologação).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'VIP (vitrine)', robots: { index: false } };

/** `/dev/vip?estado=aberta|visitante|em-breve|banido|bloqueado|em-analise|limite|vip-ativo|vip-acabando|vip-acabou|sandbox|indisponivel`. */
export default async function VipGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  const { estado } = await searchParams;
  const state = isVipState(estado) ? estado : 'aberta';
  const { packages, vip } = vipFixture(state);
  return (
    <>
      <nav
        aria-label="Estados da vitrine"
        className="container-page flex flex-wrap gap-1.5 pt-6 text-[13px] font-semibold"
        data-testid="vip-gallery-nav"
      >
        {VIP_STATES.map((key) => (
          <Link
            key={key}
            href={`/dev/vip?estado=${key}` as never}
            aria-current={key === state ? 'page' : undefined}
            className="rounded-full bg-(--fill-rest) px-3.5 py-2 transition-colors duration-(--dur-fast) hover:bg-[color-mix(in_srgb,var(--text)_13%,transparent)] aria-[current=page]:bg-foreground aria-[current=page]:text-background"
          >
            {VIP_STATE_LABEL[key]}
          </Link>
        ))}
      </nav>
      <VipView packages={packages} vip={vip} />
    </>
  );
}
