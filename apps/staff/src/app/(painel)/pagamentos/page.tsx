import { PAYMENT_STATUSES } from '@carmine/contracts/payments';
import { staffCan } from '@carmine/contracts/staff';
import type {
  StaffCompensationOverview,
  StaffPaymentFilter,
  StaffPaymentPage,
} from '@carmine/contracts/staff-payments';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PaymentOperations } from '@/components/payments/payment-operations';
import { PaymentsScreen } from '@/components/payments/payments-screen';
import { apiGet } from '@/lib/api';
import { suggestedCompensationKey } from '@/lib/payments';
import { getPanelSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Pagamentos' };
export const dynamic = 'force-dynamic';

const FILTERS: readonly string[] = ['all', ...PAYMENT_STATUSES];

/** Pagamentos de Pacotes VIP (S25): só o Dono e o Admin (`payments.manage`); Moderador e jogador recebem 404. */
export default async function PagamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getPanelSession();
  if (session.status !== 'staff' || !staffCan(session.session.staffRole, 'payments.manage')) {
    notFound();
  }

  const { status: raw } = await searchParams;
  const filter = (raw && FILTERS.includes(raw) ? raw : 'all') as StaffPaymentFilter;

  const [page, overview] = await Promise.all([
    apiGet<StaffPaymentPage>(`/api/staff/payments?status=${filter}&limit=50`),
    apiGet<StaffCompensationOverview>('/api/staff/payments/compensation'),
  ]);
  if (page.status === 401 || page.status === 403) notFound();

  if (!page.ok) {
    return (
      <div className="stp-page">
        <div className="stp-card">
          <div className="stp-empty" role="alert">
            <b>Sem dado: a API não respondeu</b>
            <span>Não deu para carregar os pagamentos agora. Tente de novo em instantes.</span>
          </div>
        </div>
      </div>
    );
  }

  const signature = page.data.payments
    .map((payment) => `${payment.id}:${payment.status}:${payment.refundedCents}`)
    .join(',');

  return (
    <>
      {/* A chave inclui o estado de cada linha: depois de conciliar, o refresh traz linhas novas e a lista remonta com elas. */}
      <PaymentsScreen key={`${filter}|${signature}`} initial={page.data} filter={filter} />
      <div className="stp-page">
        <PaymentOperations
          overview={overview.ok ? overview.data : null}
          defaultKey={suggestedCompensationKey(new Date())}
        />
      </div>
    </>
  );
}
