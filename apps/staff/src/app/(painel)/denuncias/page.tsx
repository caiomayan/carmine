import {
  type ReportStatus,
  reportStatusSchema,
  type StaffReportPage,
} from '@carmine/contracts/reports';
import { staffCan } from '@carmine/contracts/staff';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReportsScreen } from '@/components/reports/reports-screen';
import { apiGet } from '@/lib/api';
import { getPanelSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Denúncias' };
export const dynamic = 'force-dynamic';

/**
 * A fila de Denúncias (S25): a primeira página de casos do estado pedido (`?status=`, padrão Abertas). O resto vem por
 * cursor, no navegador, quando a pessoa pede.
 */
export default async function DenunciasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getPanelSession();
  if (session.status !== 'staff' || !staffCan(session.session.staffRole, 'reports.handle'))
    notFound();

  const { status: raw } = await searchParams;
  const parsed = reportStatusSchema.safeParse(raw ?? 'open');
  const status: ReportStatus = parsed.success ? parsed.data : 'open';

  const page = await apiGet<StaffReportPage>(`/api/staff/reports?status=${status}&limit=50`);
  if (!page.ok) {
    return (
      <div className="stp-page">
        <div className="stp-card">
          <div className="stp-empty" role="alert">
            <b>Sem dado: a API não respondeu</b>
            <span>
              Não deu para carregar a fila de Denúncias agora. Tente de novo em instantes.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ReportsScreen
      key={status}
      initial={page.data}
      status={status}
      serverNowMs={Date.now()}
      canArchive={staffCan(session.session.staffRole, 'reports.handle')}
    />
  );
}
