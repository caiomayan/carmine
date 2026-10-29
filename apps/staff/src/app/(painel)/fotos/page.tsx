import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Fotos denunciadas' };

export default function Page() {
  return (
    <ComingSoon
      title="Fotos denunciadas"
      text="A fila de fotos denunciadas chega no próximo PR. Até lá, continua em /staff/fotos no site."
    />
  );
}
