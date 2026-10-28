import type { PaymentMethod, PaymentStatus } from '@carmine/contracts';
import type { ProviderPayment } from '../gateway.js';

/**
 * Do pagamento do Mercado Pago (`GET /v1/payments/{id}`) para o que a porta `Payments` entende. Funções puras, testadas
 * contra as respostas gravadas da documentação. Os valores de `status` e `status_detail` são os da tabela oficial
 * "Consulta sobre o status de um pagamento" (docs/checkout-api-payments/response-handling/query-results, 2026-10-28).
 */

/** O que o adaptador lê de um pagamento do Mercado Pago (o resto da resposta é ignorado). */
export interface MpPayment {
  id: number | string;
  status: string;
  status_detail?: string | null;
  /** Número ou texto (`"24.50"`): a documentação mostra os dois. */
  transaction_amount: number | string;
  transaction_amount_refunded?: number | string | null;
  payment_method_id?: string | null;
  payment_type_id?: string | null;
  date_approved?: string | null;
  external_reference?: string | null;
  collector_id?: number | string | null;
  payer?: {
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    identification?: { type?: string | null; number?: string | null } | null;
  } | null;
}

/** Reais (número ou texto) em centavos inteiros, sem erro de ponto flutuante. */
export function centsOf(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const reais = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(reais)) throw new Error(`valor inválido do Mercado Pago: ${String(value)}`);
  return Math.round(reais * 100);
}

/**
 * O estado do pagamento. `approved` com algo devolvido é reembolso parcial (a documentação o dá como
 * `status_detail: partially_refunded`) e, se devolveu tudo, reembolsado; `authorized`, `in_process` e `in_mediation`
 * ficam "em análise" (nada é concedido por eles); `cancelled` com `status_detail: expired` é o Pix vencido.
 * Um estado que a documentação não lista levanta erro: o aviso volta com 5xx e o Mercado Pago reenvia, em vez de
 * o pagamento ficar parado sem ninguém ver.
 */
export function statusOf(payment: MpPayment): Exclude<PaymentStatus, 'created'> {
  const total = centsOf(payment.transaction_amount);
  const refunded = centsOf(payment.transaction_amount_refunded);
  switch (payment.status) {
    case 'approved':
      if (refunded > 0) return refunded >= total ? 'refunded' : 'partially_refunded';
      return payment.status_detail === 'partially_refunded' ? 'partially_refunded' : 'approved';
    case 'authorized':
    case 'in_process':
    case 'in_mediation':
      return 'in_review';
    case 'pending':
      return 'pending';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return payment.status_detail === 'expired' ? 'expired' : 'cancelled';
    case 'refunded':
      return 'refunded';
    case 'charged_back':
      return 'charged_back';
    default:
      throw new Error(`status desconhecido do Mercado Pago: ${payment.status}`);
  }
}

/** Pix (`bank_transfer`, `pix`) ou cartão (crédito, débito, pré-pago); o que não se reconhece conta como cartão. */
export function methodOf(payment: MpPayment): PaymentMethod {
  if (payment.payment_method_id === 'pix' || payment.payment_type_id === 'bank_transfer') {
    return 'pix';
  }
  return 'card';
}

export function toProviderPayment(payment: MpPayment): ProviderPayment {
  const status = statusOf(payment);
  const total = centsOf(payment.transaction_amount);
  const names = [payment.payer?.first_name, payment.payer?.last_name]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' ');
  const email = payment.payer?.email?.trim() || null;
  const document = payment.payer?.identification?.number?.trim() || null;
  return {
    providerPaymentId: String(payment.id),
    externalReference: payment.external_reference ?? '',
    status,
    amountCents: total,
    refundedCents: status === 'refunded' ? total : centsOf(payment.transaction_amount_refunded),
    method: methodOf(payment),
    approvedAt: payment.date_approved ? new Date(payment.date_approved) : null,
    payer: names || email || document ? { name: names || null, document, email } : null,
  };
}

/**
 * `yyyy-MM-dd'T'HH:mm:ss.SSS-03:00`, o formato dos exemplos da documentação (`2020-05-30T23:59:59.000-04:00`). O Brasil
 * não tem horário de verão desde 2019, então o horário de Brasília é sempre -03:00.
 */
export function brasiliaIso(date: Date): string {
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 23)}-03:00`;
}

/** Quanto vale cada estado ao escolher, entre os pagamentos de uma preferência, o que a Carmine acompanha. */
export function relevance(payment: MpPayment): number {
  switch (payment.status) {
    case 'approved':
    case 'refunded':
    case 'charged_back':
    case 'in_mediation':
      return 4;
    case 'authorized':
    case 'in_process':
      return 3;
    case 'pending':
      return 2;
    default:
      return 1;
  }
}
