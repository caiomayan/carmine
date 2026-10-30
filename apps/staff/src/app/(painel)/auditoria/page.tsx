import type { Metadata } from 'next';
import { ComingSoon } from '@/components/coming-soon';

export const metadata: Metadata = { title: 'Auditoria' };

export default function Page() {
  return (
    <ComingSoon
      title="Auditoria"
      text="O log de auditoria chega num PR seguinte. Até lá, continua em /staff/auditoria no site."
    />
  );
}
