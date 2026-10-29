import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ConfirmView } from '@/components/vip/confirm-view';
import { getServerSession, getVipPackages } from '@/lib/api-server';
import { signInHref } from '@/lib/auth-links';
import { buyState } from '@/lib/vip/packages';
import { packageFromParam } from '@/lib/vip/purchase';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('vip.confirm');
  return { title: t('metaTitle'), robots: { index: false } };
}

/**
 * `/plans/checkout?pacote=vip-3m`: a confirmação da compra. Sem sessão, entra com a Steam e volta aqui; sem Pacote válido,
 * ou com a cobrança desligada, volta ao `/plans`. Se a Conta não pode comprar (ban, bloqueio, pagamento em análise, limite
 * do dia), a tela mostra o motivo no lugar do formulário.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ pacote?: string | string[] }>;
}) {
  const { pacote } = await searchParams;
  const pack = packageFromParam(pacote);
  if (!pack) redirect('/plans');

  const [session, packages] = await Promise.all([getServerSession(), getVipPackages()]);
  if (session.status === 'anonymous') {
    redirect(signInHref(`/plans/checkout?pacote=${pack.id}`) as never);
  }
  // Sessão ou API fora do ar: a página do VIP já diz isso; aqui não há o que confirmar.
  if (session.status !== 'authenticated' || !packages) redirect('/plans');

  const state = buyState(packages);
  if (state.kind === 'soon') redirect('/plans');

  const { account, vip } = session.session;
  return (
    <ConfirmView
      pack={pack}
      account={account}
      vipEndsAt={vip.active ? vip.endsAt : null}
      block={state.kind === 'blocked' ? state.reason : null}
      now={new Date()}
    />
  );
}
