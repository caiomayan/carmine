import type { PaymentMethod, PaymentStatus } from '@carmine/contracts';

/**
 * A porta `Payments` (S14): o que a API precisa de um provedor de pagamento, e nada além. Só o
 * adaptador (Mercado Pago, ou o falso de dev e homologação) conhece o provedor. O VIP só é
 * concedido a partir de {@link PaymentsGateway.getPayment}, nunca do corpo de um webhook.
 */

/** O que o provedor diz de um pagamento agora. */
export interface ProviderPayment {
  providerPaymentId: string;
  /** O `external_reference` que mandamos: o ID do nosso pagamento. */
  externalReference: string;
  /** Um dos estados do pagamento (nunca `created`, que é só nosso). */
  status: Exclude<PaymentStatus, 'created'>;
  amountCents: number;
  /** O quanto já foi devolvido. */
  refundedCents: number;
  method: PaymentMethod;
  approvedAt: Date | null;
  /** Quem pagou, conforme o provedor (o CPF vem aqui, em texto; quem chama o cifra). */
  payer: { name: string | null; document: string | null; email: string | null } | null;
}

export interface CreateChargeInput {
  /** O ID do nosso pagamento: vai como `external_reference`. */
  paymentId: string;
  amountCents: number;
  method: PaymentMethod;
  description: string;
  expiresAt: Date;
  /** Para onde o checkout do cartão devolve a pessoa. */
  backUrl: string;
}

export interface ProviderCharge {
  providerPaymentId: string;
  /** Pix: o "copia e cola" e o QR em PNG (base64), se o provedor o devolve. */
  pix?: { copyPaste: string; qrCodeBase64: string | null };
  /** Cartão: o checkout hospedado do provedor. */
  redirectUrl?: string;
}

/** Uma requisição de webhook, como chegou. */
export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | undefined>;
  body: unknown;
  now?: Date;
}

export type WebhookCheck =
  | { valid: true; topic: string; resourceId: string; requestId: string | null }
  | { valid: false; reason: string; requestId: string | null };

export interface PaymentsGateway {
  readonly name: 'fake' | 'mercadopago';
  createCharge(input: CreateChargeInput): Promise<ProviderCharge>;
  /** Nulo: o provedor não conhece esse pagamento. */
  getPayment(providerPaymentId: string): Promise<ProviderPayment | null>;
  /** Cancela uma cobrança ainda não paga; cancelar o que já foi pago ou vencido não faz nada. */
  cancelCharge(providerPaymentId: string): Promise<void>;
  /** Estorno de `amountCents` (o total do pagamento é o estorno integral). */
  refund(providerPaymentId: string, amountCents: number, idempotencyKey: string): Promise<void>;
  verifyWebhook(request: WebhookRequest): WebhookCheck;
  /** De um aviso (`topic` e `resourceId`), o ID do pagamento a consultar; nulo se o aviso não é de pagamento. */
  resolvePaymentId(topic: string, resourceId: string): Promise<string | null>;
}
