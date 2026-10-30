import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Servidores' };

export default function Page() {
  return (
    <ComingSoon
      title="Servidores"
      text="A edição dos servidores chega num PR seguinte. Até lá, continua em /staff/servidores no site."
    />
  );
}
