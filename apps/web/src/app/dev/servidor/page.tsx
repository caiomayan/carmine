import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DevGallery } from '@/components/server-page/dev-gallery';
import { artTable } from '@/components/vida/map-art';
import { isScenarioKey } from '@/lib/server-page/fixtures';

// Como a vitrine de componentes: só existe com CARMINE_UI_GALLERY=1 (dev e E2E).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Página do servidor (vitrine)',
  robots: { index: false },
};

type Search = { estado?: string; sim?: string; ms?: string; barra?: string };

/**
 * `?estado=cheio|vazio|offline|warmup|deathmatch|coletando|nunca`, `?sim=1` liga a simulação de rounds (`?ms=` é o
 * intervalo) e `?barra=0` esconde a barra da vitrine (para os prints).
 */
export default async function ServerGalleryPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  const { estado, sim, ms, barra } = await searchParams;
  return (
    <DevGallery
      scenarioKey={isScenarioKey(estado) ? estado : 'cheio'}
      art={artTable()}
      sim={sim === '1'}
      simMs={Math.max(1200, Number(ms) || 4500)}
      bar={barra !== '0'}
    />
  );
}
