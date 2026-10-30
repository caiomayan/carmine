import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Pagamentos' };

export default function Page() {
  return (
    <ComingSoon
      title="Pagamentos"
      text="Compras e reembolsos chegam num PR seguinte. Até lá, continuam em /staff/pagamentos no site."
    />
  );
}
