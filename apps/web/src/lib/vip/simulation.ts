import type { FakePaymentAction, PaymentStatus } from '@carmine/contracts/payments';

/**
 * A página que faz o papel do provedor de pagamento FALSO (dev e homologação): o que cada ação se chama e quais valem
 * em cada status da cobrança. O provedor de verdade não tem esta página; a API só responde a ela com o falso ligado.
 */

export const ACTION_LABEL: Record<FakePaymentAction, string> = {
  pay: 'Aprovar o pagamento',
  reject: 'Recusar',
  expire: 'Deixar expirar',
  refund: 'Reembolsar',
  chargeback: 'Contestar (chargeback)',
};

export const ACTION_HINT: Record<FakePaymentAction, string> = {
  pay: 'O banco confirma: o VIP é liberado.',
  reject: 'O cartão é recusado: nada é cobrado.',
  expire: 'O prazo acaba sem pagamento.',
  refund: 'O valor volta e os dias saem do VIP.',
  chargeback: 'O dono do cartão contesta: o VIP da compra é desfeito.',
};

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  created: 'Criada',
  pending: 'Aguardando o pagamento',
  in_review: 'Em análise',
  approved: 'Aprovada',
  rejected: 'Recusada',
  expired: 'Expirada',
  cancelled: 'Cancelada',
  refunded: 'Reembolsada',
  partially_refunded: 'Reembolsada em parte',
  charged_back: 'Contestada',
};

/** As ações que fazem sentido agora: pagar, recusar e expirar valem enquanto espera; reembolsar e contestar, depois de aprovada. */
export function availableActions(status: PaymentStatus): FakePaymentAction[] {
  switch (status) {
    case 'created':
    case 'pending':
      return ['pay', 'reject', 'expire'];
    case 'approved':
    case 'partially_refunded':
      return ['refund', 'chargeback'];
    default:
      return [];
  }
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatCents = (cents: number) => brl.format(cents / 100);

/** O endereço da compra no site, para onde a página manda de volta (o cartão volta com `?retorno=cartao`, como o checkout). */
export const backToPurchase = (externalReference: string, method: 'pix' | 'card') =>
  method === 'card'
    ? `/plans/purchase/${externalReference}?retorno=cartao`
    : `/plans/purchase/${externalReference}`;

/** O id do provedor que a URL aceita: letras, números, hífen e sublinhado, sem passar disso (vai para o caminho da API). */
export const PROVIDER_ID = /^[A-Za-z0-9_-]{1,80}$/;
