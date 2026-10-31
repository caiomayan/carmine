import type { PurchaseEligibility, VipPackage, VipPackages } from '@carmine/contracts/payments';

/**
 * A matemática da página do VIP, sem React: preço em reais, preço por mês, quanto cada Pacote economiza em relação
 * a comprar mês a mês, o Pacote de melhor preço e em que estado fica o botão de comprar (aberto, "Em breve", entrar
 * com a Steam ou travado, com o motivo). Nada aqui inventa preço: tudo sai do `GET /api/vip/packages`.
 */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos em reais, como o brasileiro lê ("R$ 9,90"). */
export const formatBrl = (cents: number) => brl.format(cents / 100);

/** O preço de um mês dentro do Pacote, arredondado ao centavo. */
export const perMonthCents = (pack: Pick<VipPackage, 'priceCents' | 'months'>) =>
  Math.round(pack.priceCents / pack.months);

/**
 * Quanto o Pacote economiza (em %, inteiro) em relação a pagar o mês avulso (o Pacote de 1 mês) pelo mesmo tempo.
 * Zero para o próprio mês avulso, ou quando não há Pacote de 1 mês para comparar.
 */
export function savingsPercent(pack: VipPackage, packages: readonly VipPackage[]): number {
  const single = packages.find((candidate) => candidate.months === 1);
  if (!single || pack.months === 1) return 0;
  const full = single.priceCents * pack.months;
  if (full <= pack.priceCents) return 0;
  return Math.round(((full - pack.priceCents) / full) * 100);
}

/** O Pacote de menor preço por mês (o de mais meses no empate); nulo se só há um Pacote. */
export function bestValueId(packages: readonly VipPackage[]): VipPackage['id'] | null {
  if (packages.length < 2) return null;
  let best: VipPackage | null = null;
  for (const pack of packages) {
    if (
      !best ||
      perMonthCents(pack) < perMonthCents(best) ||
      (perMonthCents(pack) === perMonthCents(best) && pack.months > best.months)
    ) {
      best = pack;
    }
  }
  return best?.id ?? null;
}

/**
 * O que o botão de cada Pacote faz:
 * - `soon`: a cobrança está desligada ("Em breve");
 * - `signin`: visitante, entra com a Steam e volta;
 * - `blocked`: a Conta não pode comprar agora (`reason` é o motivo que a API deu);
 * - `buy`: pode comprar.
 */
export type BuyState =
  | { kind: 'soon' }
  | { kind: 'signin' }
  | { kind: 'blocked'; reason: Exclude<PurchaseEligibility, 'ok'> }
  | { kind: 'buy' };

export function buyState(data: Pick<VipPackages, 'enabled' | 'eligibility'>): BuyState {
  if (!data.enabled) return { kind: 'soon' };
  if (data.eligibility === null) return { kind: 'signin' };
  if (data.eligibility !== 'ok') return { kind: 'blocked', reason: data.eligibility };
  return { kind: 'buy' };
}

/** O endereço da confirmação de compra de um Pacote. */
export const purchaseHref = (id: VipPackage['id']) => `/plans/checkout?pacote=${id}`;
