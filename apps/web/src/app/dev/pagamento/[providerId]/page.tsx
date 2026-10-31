import { type FakePayment, fakePaymentSchema } from '@carmine/contracts/payments';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SimulationPanel } from '@/components/vip/simulation-panel';
import { apiGet } from '@/lib/api-base';
import { PROVIDER_ID } from '@/lib/vip/simulation';

// A cobrança muda a cada ação: nada de cache.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Provedor de pagamento falso',
  robots: { index: false },
};

/**
 * A cobrança no provedor FALSO, ou `null` se ela não existe ou o provedor falso não está ligado: a API só tem esta
 * rota com `PAYMENTS_PROVIDER=fake` (dev e homologação), então em produção a página é 404.
 */
async function readFakePayment(providerId: string): Promise<FakePayment | null> {
  try {
    const response = await apiGet(`/dev/payments/${providerId}`);
    if (!response.ok) return null;
    return fakePaymentSchema.parse(await response.json());
  } catch {
    return null;
  }
}

/**
 * `/dev/pagamento/{providerId}`: o `simulationUrl` da compra no provedor falso. Faz o papel do banco e do checkout do
 * cartão: aprova, recusa, deixa expirar, reembolsa ou contesta, e a API recebe o webhook como receberia do provedor.
 */
export default async function FakeProviderPage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  if (!PROVIDER_ID.test(providerId)) notFound();
  const payment = await readFakePayment(providerId);
  if (!payment) notFound();
  return <SimulationPanel providerId={providerId} initial={payment} />;
}
