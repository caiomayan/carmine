import { staffCan } from '@carmine/contracts/staff';
import { staffPaymentDetailSchema } from '@carmine/contracts/staff-payments';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PaymentSheet } from '@/components/staff/payment-sheet';
import { getServerSession, readStaff } from '@/lib/api-server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A ficha de um pagamento (S14): provedor, valores, webhooks e as ações da Staff. Só o Dono e o Admin. */
export default async function StaffPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const server = await getServerSession();
  const role = server.status === 'authenticated' ? server.session.staffRole : null;
  if (!staffCan(role, 'payments.manage')) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const result = await readStaff(`/staff/payments/${id}`, staffPaymentDetailSchema);
  if (result.status === 'ok') return <PaymentSheet initial={result.data} />;
  if (result.status === 'unavailable') {
    const t = await getTranslations('staff.payments');
    return (
      <p role="alert" className="text-sm">
        {t('unavailable')}
      </p>
    );
  }
  notFound();
}
