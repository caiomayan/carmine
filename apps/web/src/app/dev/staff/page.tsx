import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaffProto } from '@/components/proto-staff/staff-proto';
import { artTable } from '@/components/vida/map-art';

// PROTÓTIPO (vitrine): como /dev/sobre, só existe com CARMINE_UI_GALLERY=1 (dev local, E2E e homologação).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Painel da Staff (protótipo)',
  robots: { index: false, follow: false },
};

/**
 * `/dev/staff`: a direção do Painel da Staff novo (S25, PR A). Dados fictícios, nada vem da API. O painel cobre a
 * janela inteira (o cabeçalho e o rodapé do site ficam escondidos enquanto ele existe) e só esta rota carrega o CSS,
 * e o código dele. A arte do hero é a de mapa do próprio site.
 */
export default function StaffProtoPage() {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  const art = artTable();
  return (
    <StaffProto
      nowMs={Date.now()}
      heroMap={art.de_mirage ? 'de_mirage' : (Object.keys(art)[0] ?? null)}
      heroArt={art.de_mirage ?? Object.values(art)[0] ?? null}
    />
  );
}
