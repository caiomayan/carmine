import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Contas' };

export default function Page() {
  return (
    <ComingSoon
      title="Contas"
      text="A ficha da Conta e as Punições chegam num PR seguinte. Até lá, continuam em /staff no site."
    />
  );
}
