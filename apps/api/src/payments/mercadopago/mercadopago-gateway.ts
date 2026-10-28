import type {
  CreateChargeInput,
  PaymentsGateway,
  ProviderCharge,
  ProviderPayment,
  WebhookCheck,
  WebhookRequest,
} from '../gateway.js';
import { verifyWebhookSignature } from '../webhook-signature.js';
import { type MercadoPagoClient, MercadoPagoError } from './mercadopago-client.js';
import {
  brasiliaIso,
  type MpPayment,
  relevance,
  toProviderPayment,
} from './mercadopago-mapping.js';

/**
 * O adaptador do Mercado Pago (S14c) da porta `Payments`, sem SDK: Pix pela API de pagamentos (`POST /v1/payments`) e
 * cartão por Checkout Pro (`POST /checkout/preferences`, com redirecionamento). As páginas oficiais em que cada chamada
 * se apoia estão em `docs/operacao/mercadopago.md` (lidas em 2026-10-28). O VIP só é concedido pelo `getPayment` (a
 * porta já garante: o corpo do webhook nunca vale).
 *
 * O cartão não tem pagamento no momento da cobrança (só a preferência), então o `providerPaymentId` dele é
 * `ref:<id do nosso pagamento>` e cada consulta procura os pagamentos pelo `external_reference`. O Pix usa o id
 * numérico do pagamento.
 */

/** O prefixo do `providerPaymentId` das cobranças de cartão (a preferência do Checkout Pro). */
export const CARD_REFERENCE_PREFIX = 'ref:';

/** O Pix não pode vencer antes de 30 min da emissão (documentação): damos 1 min de folga sobre o relógio daqui. */
const PIX_MIN_EXPIRY_MS = 31 * 60 * 1000;

const NUMERIC_ID = /^\d{1,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Só o cartão: fora ficam o boleto, o caixa eletrônico e a transferência (o Pix tem o fluxo próprio, pela API). */
const NON_CARD_TYPES = ['ticket', 'atm', 'bank_transfer'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const first = (value: string | string[] | undefined): string | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

export interface MercadoPagoGatewayOptions {
  client: MercadoPagoClient;
  /** A "assinatura secreta" do webhook (Suas integrações > Webhooks > Configurar notificação). */
  webhookSecret: string;
  /**
   * O domínio do e-mail de pagador que a API do Pix exige. A Carmine não guarda e-mail de ninguém (o login é pela
   * Steam), então vai um endereço por pagamento, `pagamentos+<id>@<domínio>`; o pagador de verdade só aparece no
   * pagamento aprovado.
   */
  payerEmailDomain: string;
  clock?: () => Date;
}

export class MercadoPagoGateway implements PaymentsGateway {
  readonly name = 'mercadopago' as const;
  /** O `collector_id` (a conta vendedora), aprendido nos pagamentos lidos: a consulta de contestação o pede. */
  private collectorId: string | null = null;

  constructor(private readonly options: MercadoPagoGatewayOptions) {}

  private now(): Date {
    return this.options.clock?.() ?? new Date();
  }

  async createCharge(input: CreateChargeInput): Promise<ProviderCharge> {
    return input.method === 'pix' ? this.createPix(input) : this.createCard(input);
  }

  private async createPix(input: CreateChargeInput): Promise<ProviderCharge> {
    const earliest = new Date(this.now().getTime() + PIX_MIN_EXPIRY_MS);
    const payment = await this.options.client.request<{
      id: number | string;
      point_of_interaction?: {
        transaction_data?: { qr_code?: string | null; qr_code_base64?: string | null };
      };
    }>('POST', '/v1/payments', {
      idempotencyKey: `charge-${input.paymentId}`,
      body: {
        transaction_amount: input.amountCents / 100,
        description: input.description,
        payment_method_id: 'pix',
        external_reference: input.paymentId,
        date_of_expiration: brasiliaIso(input.expiresAt > earliest ? input.expiresAt : earliest),
        payer: { email: `pagamentos+${input.paymentId}@${this.options.payerEmailDomain}` },
      },
    });
    const data = payment.point_of_interaction?.transaction_data;
    if (!data?.qr_code) throw new Error('resposta do Mercado Pago sem o "copia e cola" do Pix');
    return {
      providerPaymentId: String(payment.id),
      pix: { copyPaste: data.qr_code, qrCodeBase64: data.qr_code_base64 ?? null },
    };
  }

  private async createCard(input: CreateChargeInput): Promise<ProviderCharge> {
    const now = this.now();
    const earliest = new Date(now.getTime() + PIX_MIN_EXPIRY_MS);
    const preference = await this.options.client.request<{ id?: string; init_point?: string }>(
      'POST',
      '/checkout/preferences',
      {
        body: {
          items: [
            {
              id: input.paymentId,
              title: input.description,
              quantity: 1,
              currency_id: 'BRL',
              unit_price: input.amountCents / 100,
            },
          ],
          external_reference: input.paymentId,
          back_urls: { success: input.backUrl, pending: input.backUrl, failure: input.backUrl },
          auto_return: 'approved',
          // Só aprovado ou recusado: sem "em processo" a compra não fica pendurada.
          binary_mode: true,
          payment_methods: { excluded_payment_types: NON_CARD_TYPES.map((id) => ({ id })) },
          statement_descriptor: 'SAINTCARMINE',
          expires: true,
          expiration_date_from: brasiliaIso(now),
          expiration_date_to: brasiliaIso(input.expiresAt > earliest ? input.expiresAt : earliest),
        },
      },
    );
    if (!preference.init_point) throw new Error('resposta do Mercado Pago sem o link do checkout');
    return {
      providerPaymentId: `${CARD_REFERENCE_PREFIX}${input.paymentId}`,
      redirectUrl: preference.init_point,
    };
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPayment | null> {
    const payment = await this.readPayment(providerPaymentId);
    return payment ? toProviderPayment(payment) : null;
  }

  /** O pagamento do Mercado Pago de um `providerPaymentId` nosso (id numérico do Pix, ou `ref:` do cartão). */
  private async readPayment(providerPaymentId: string): Promise<MpPayment | null> {
    if (providerPaymentId.startsWith(CARD_REFERENCE_PREFIX)) {
      return this.searchByReference(providerPaymentId.slice(CARD_REFERENCE_PREFIX.length));
    }
    if (!NUMERIC_ID.test(providerPaymentId)) return null;
    try {
      const payment = await this.options.client.request<MpPayment>(
        'GET',
        `/v1/payments/${providerPaymentId}`,
      );
      this.learnCollector(payment);
      return payment;
    } catch (error) {
      if (error instanceof MercadoPagoError && error.status === 404) return null;
      throw error;
    }
  }

  /**
   * Os pagamentos de uma cobrança de cartão: busca pelo `external_reference` (`GET /v1/payments/search`). Se houve mais
   * de uma tentativa (um cartão recusado e outro aprovado), fica a de maior relevância (aprovada ou devolvida antes de
   * pendente antes das demais), e entre iguais a mais recente.
   */
  private async searchByReference(reference: string): Promise<MpPayment | null> {
    if (!UUID.test(reference)) return null;
    const found = await this.options.client.request<unknown>('GET', '/v1/payments/search', {
      query: {
        external_reference: reference,
        sort: 'date_created',
        criteria: 'desc',
        range: 'date_created',
        begin_date: 'NOW-90DAYS',
        end_date: 'NOW',
      },
    });
    // A documentação mostra a resposta embrulhada num array (`[{ paging, results }]`); aceita as duas formas.
    const page = Array.isArray(found) ? found[0] : found;
    const results =
      isRecord(page) && Array.isArray(page.results) ? (page.results as MpPayment[]) : [];
    let best: MpPayment | null = null;
    for (const candidate of results) {
      if (best === null || relevance(candidate) > relevance(best)) best = candidate;
    }
    if (best) this.learnCollector(best);
    return best;
  }

  private learnCollector(payment: MpPayment): void {
    if (payment.collector_id !== undefined && payment.collector_id !== null) {
      this.collectorId = String(payment.collector_id);
    }
  }

  async cancelCharge(providerPaymentId: string): Promise<void> {
    // Cartão: a preferência vence sozinha (`expires`) e não há pagamento pendente a cancelar.
    if (!NUMERIC_ID.test(providerPaymentId)) return;
    try {
      await this.options.client.request('PUT', `/v1/payments/${providerPaymentId}`, {
        body: { status: 'cancelled' },
      });
    } catch (error) {
      // Só cancela pendente, em processo ou autorizado; pago, vencido ou inexistente: nada a fazer.
      if (error instanceof MercadoPagoError && (error.status === 400 || error.status === 404))
        return;
      throw error;
    }
  }

  async refund(
    providerPaymentId: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<void> {
    const payment = await this.readPayment(providerPaymentId);
    if (!payment) throw new Error('o Mercado Pago não conhece este pagamento');
    const remote = toProviderPayment(payment);
    const remaining = remote.amountCents - remote.refundedCents;
    if (amountCents <= 0 || amountCents > remaining) {
      throw new Error('valor de estorno fora do que resta do pagamento');
    }
    // Sem `amount` o reembolso é integral (documentação); com `amount`, parcial. A chave leva o valor: a mesma
    // chave com outro valor (estornos parciais seguidos) não pode ser lida como repetição.
    const full = remote.refundedCents === 0 && amountCents === remote.amountCents;
    await this.options.client.request('POST', `/v1/payments/${remote.providerPaymentId}/refunds`, {
      idempotencyKey: `${idempotencyKey}:${amountCents}`.slice(0, 128),
      ...(full ? {} : { body: { amount: amountCents / 100 } }),
    });
  }

  verifyWebhook(request: WebhookRequest): WebhookCheck {
    const requestId = first(request.headers['x-request-id']);
    const body = isRecord(request.body) ? request.body : {};
    const bodyId = isRecord(body.data) ? body.data.id : undefined;
    const queryId = text(request.query['data.id']);
    const signed = verifyWebhookSignature({
      secret: this.options.webhookSecret,
      header: first(request.headers['x-signature']) ?? undefined,
      // A assinatura vale sobre o `data.id` da URL (query), como a documentação e o SDK oficial fazem.
      dataId: queryId,
      requestId,
      now: request.now ?? this.now(),
    });
    if (!signed.valid) return { valid: false, reason: signed.reason, requestId };
    // O `user_id` do aviso assinado é a conta vendedora: o que a consulta de contestação pede em `X-Caller-Id`.
    if (
      typeof body.user_id === 'number' ||
      (typeof body.user_id === 'string' && NUMERIC_ID.test(body.user_id))
    ) {
      this.collectorId = String(body.user_id);
    }
    return {
      valid: true,
      topic:
        text(body.type) ?? text(request.query.type) ?? text(request.query.topic) ?? 'desconhecido',
      resourceId: queryId ?? (bodyId === undefined || bodyId === null ? '' : String(bodyId)),
      requestId,
    };
  }

  async resolvePaymentId(topic: string, resourceId: string): Promise<string | null> {
    if (!NUMERIC_ID.test(resourceId)) return null;
    switch (topic) {
      case 'payment':
        return resourceId;
      case 'topic_merchant_order_wh':
      case 'merchant_order': {
        // O pedido comercial do Checkout Pro leva o `external_reference`: é a cobrança de cartão.
        const order = await this.options.client.request<{
          external_reference?: string | null;
          payments?: { id?: number | string }[];
        }>('GET', `/merchant_orders/${resourceId}`);
        if (order.external_reference && UUID.test(order.external_reference)) {
          return `${CARD_REFERENCE_PREFIX}${order.external_reference}`;
        }
        const id = order.payments?.[0]?.id;
        return id === undefined ? null : String(id);
      }
      case 'topic_chargebacks_wh':
      case 'chargebacks': {
        // A consulta pede o `X-Caller-Id` (a conta vendedora). Sem ele conhecido, o aviso é ignorado e a conciliação
        // (`payments reconcile`, a varredura) pega o `charged_back` na consulta do pagamento.
        if (this.collectorId === null) return null;
        const chargeback = await this.options.client.request<{ payments?: (number | string)[] }>(
          'GET',
          `/v1/chargebacks/${resourceId}`,
          { headers: { 'x-caller-id': this.collectorId } },
        );
        const id = chargeback.payments?.[0];
        return id === undefined ? null : String(id);
      }
      default:
        return null;
    }
  }
}
