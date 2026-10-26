import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isScenarioKey } from '@/components/servidor-proto/data';
import { ServidorProto } from '@/components/servidor-proto/servidor-proto';
import { artTable } from '@/components/vida/map-art';

// PROTÓTIPO (não vai para produção): como a vitrine de componentes, só existe com CARMINE_UI_GALLERY=1.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Protótipo · página do servidor',
  robots: { index: false },
};

type Search = { estado?: string; sim?: string; ms?: string; barra?: string };

/**
 * `?estado=cheio|vazio|offline|warmup`, `?sim=1` liga a simulação de rounds (`?ms=` é o intervalo) e `?barra=0`
 * esconde a barra do protótipo (para os prints).
 */
export default async function ServidorProtoPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  const { estado, sim, ms, barra } = await searchParams;
  return (
    <ServidorProto
      scenarioKey={isScenarioKey(estado) ? estado : 'cheio'}
      art={artTable()}
      sim={sim === '1'}
      simMs={Math.max(1200, Number(ms) || 4500)}
      bar={barra !== '0'}
    />
  );
}
