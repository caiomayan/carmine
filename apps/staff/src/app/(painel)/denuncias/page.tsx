import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Denúncias' };

export default function Page() {
  return (
    <ComingSoon
      title="Denúncias"
      text="A fila de Denúncias, agrupada por caso, chega no próximo PR. Até lá, continua em /staff/denuncias no site."
    />
  );
}
