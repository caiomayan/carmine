import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { BadgeAlertIcon } from '@/components/icons/animated/badge-alert';
import { Button } from '@/components/ui/button';
import { PurchasePage } from '@/components/vip/purchase-page';
import { getPurchase } from '@/lib/api-server';
import { signInHref } from '@/lib/auth-links';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vip.purchase');
  return { title: t('metaTitle'), robots: { index: false } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `/vip/compra/{id}`: a página de uma compra. É o endereço do "continuar pagamento" (recuperação pelo id), o que o
 * checkout do cartão devolve (`?retorno=cartao`, e a tela decide pelo estado da compra, nunca pelo parâmetro) e onde
 * o Pix pendente espera. A compra é sempre da Conta da sessão: de outra Conta, a API responde que não existe.
 */
export default async function PurchaseRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retorno?: string | string[] }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { retorno } = await searchParams;

  const result = await getPurchase(id);
  if (result.status === 'anonymous') redirect(signInHref(`/vip/compra/${id}`) as never);
  if (result.status === 'not-found') notFound();
  if (result.status === 'unavailable') {
    const t = await getTranslations('vip.packages');
    return (
      <div className="container-page pb-24 pt-16" data-testid="vip-purchase-unavailable">
        <EmptyState
          icon={BadgeAlertIcon}
          title={t('unavailable')}
          body={t('unavailableBody')}
          action={
            <Button asChild>
              <Link href={`/vip/compra/${id}` as Route}>{t('retry')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const returned = (Array.isArray(retorno) ? retorno[0] : retorno) === 'cartao';
  return <PurchasePage purchase={result.purchase} returnedFromCard={returned} />;
}
