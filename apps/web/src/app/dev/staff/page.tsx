import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StaffProto } from '@/components/proto-staff/staff-proto';

// PROTÓTIPO (vitrine): como /dev/sobre, só existe com CARMINE_UI_GALLERY=1 (dev local, E2E e homologação).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Painel da Staff (protótipo)',
  robots: { index: false, follow: false },
};

/**
 * `/dev/staff`: a direção do Painel da Staff novo (S25, PR A). Dados fictícios, nada vem da API. O painel cobre a
 * janela inteira (o cabeçalho e o rodapé do site ficam escondidos enquanto ele existe) e só esta rota carrega o CSS
 * e o código dele.
 */
export default function StaffProtoPage() {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  return <StaffProto nowMs={Date.now()} />;
}
