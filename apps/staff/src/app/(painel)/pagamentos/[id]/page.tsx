import { staffCan } from '@carmine/contracts/staff';
import type { StaffPaymentDetail } from '@carmine/contracts/staff-payments';
import { ArrowLeftIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PaymentDetail } from '@/components/payments/payment-detail';
import { apiGet } from '@/lib/api';
import { shortId } from '@/lib/payments';
import { getPanelSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Pagamento' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A ficha de um pagamento como página própria (S25): o endereço que a Staff cola em um chamado e que o suporte abre
 * direto, sem depender de o pagamento estar entre os 50 carregados da lista. Só o Dono e o Admin (`payments.manage`).
 */
export default async function PagamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getPanelSession();
  if (session.status !== 'staff' || !staffCan(session.session.staffRole, 'payments.manage')) {
    notFound();
  }
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const result = await apiGet<StaffPaymentDetail>(`/api/staff/payments/${id}`);
  if (result.status === 401 || result.status === 403 || result.status === 404) notFound();

  return (
    <div className="stp-page" data-testid="stp-payment-page">
      <div className="stp-head">
        <div>
          <Link className="stp-btn" href="/pagamentos" prefetch={false}>
            <ArrowLeftIcon size={14} aria-hidden="true" /> Pagamentos
          </Link>
          <h1>Pagamento {shortId(id)}</h1>
        </div>
      </div>
      {result.ok ? (
        <div className="stp-card stp-detail stp-detail-page">
          <PaymentDetail summary={result.data.payment} initial={result.data} />
        </div>
      ) : (
        <div className="stp-card">
          <div className="stp-empty" role="alert">
            <b>Sem dado: a API não respondeu</b>
            <span>Não deu para abrir este pagamento agora. Tente de novo em instantes.</span>
          </div>
        </div>
      )}
    </div>
  );
}
