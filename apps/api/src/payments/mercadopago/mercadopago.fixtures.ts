/**
 * Respostas do Mercado Pago para os testes do adaptador (S14c), na forma que a DOCUMENTAÇÃO OFICIAL mostra
 * (lidas em 2026-10-28, somente mercadopago.com.br/developers). Cada constante diz de onde veio:
 *
 * - **literal**: o JSON (ou o trecho dele) copiado da página;
 * - **montado**: o formato é o da página, mas o valor foi escolhido a partir da tabela oficial de status
 *   (docs/checkout-api-payments/response-handling/query-results), porque a documentação não traz um exemplo
 *   daquele caso. Nenhuma resposta aqui foi gravada de uma conta real: isso só o sandbox prova (ver
 *   `mercadopago.contract.spec.ts` e docs/operacao/mercadopago.md).
 */

export const EXTERNAL_REFERENCE = '5a0e9c3e-1d2b-4c47-9a55-3b7a2f0c8d11';

/**
 * literal: resposta de `POST /v1/payments` com Pix, da página
 * https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix
 * (campos que a página mostra: id, status, status_detail e `point_of_interaction.transaction_data`).
 */
export const PIX_CREATED = {
  id: 5466310457,
  status: 'pending',
  status_detail: 'pending_waiting_transfer',
  point_of_interaction: {
    type: 'PIX',
    transaction_data: {
      qr_code_base64: 'iVBORw0KGgoAAAANSUhEUg...',
      qr_code:
        '00020126600014br.gov.bcb.pix0117john@yourdomain.com0217additional data5204...6304E2CA',
      ticket_url:
        'https://www.mercadopago.com.br/payments/123456789/ticket?caller_id=123456&hash=123e4567-e89b-12d3-a456-426655440000',
      transaction_id: null,
    },
  },
};

/**
 * literal: resposta de exemplo de `GET /v1/payments/{id}` (um cartão aprovado; a página não traz exemplo de Pix),
 * de https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api-payments/get-payment/get
 * Note que `transaction_amount` vem como texto ("24.50") e `transaction_amount_refunded` como número.
 */
export const PAYMENT_APPROVED_CARD = {
  id: 1,
  date_created: '2017-08-31T11:26:38.000Z',
  date_approved: '2017-08-31T11:26:38.000Z',
  date_last_updated: '2017-08-31T11:26:38.000Z',
  money_release_date: '2017-09-14T11:26:38.000Z',
  payment_method: {
    data: { threeds: 'NOT_AUTHENTICATED' },
    id: 'visa',
    issuer_id: '12518',
    type: 'credit_card',
  },
  payment_method_id: 'visa',
  payment_type_id: 'credit_card',
  status: 'approved',
  status_detail: 'accredited',
  currency_id: 'BRL',
  description: 'Pago Pizza',
  collector_id: 2,
  payer: {
    id: 123,
    email: 'test_payer@example.com',
    identification: { type: 'CPF', number: '19119119100' },
    type: 'customer',
  },
  metadata: {},
  additional_info: {},
  external_reference: 'MP0001',
  transaction_amount: '24.50',
  transaction_amount_refunded: 0,
  coupon_amount: 0,
  transaction_details: {
    net_received_amount: 250,
    total_paid_amount: '50.00',
    overpaid_amount: 0,
    installment_amount: 250,
  },
  installments: 1,
  card: {},
};

/** montado: um Pix aprovado (o mesmo formato, `payment_type_id: bank_transfer`, com o pagador que o MP informa). */
export const PAYMENT_APPROVED_PIX = {
  id: 5466310457,
  date_approved: '2026-10-28T14:05:10.000-03:00',
  payment_method_id: 'pix',
  payment_type_id: 'bank_transfer',
  status: 'approved',
  status_detail: 'accredited',
  currency_id: 'BRL',
  collector_id: 2,
  payer: {
    email: 'pagador@example.com',
    first_name: 'Maria',
    last_name: 'Silva',
    identification: { type: 'CPF', number: '19119119100' },
  },
  external_reference: EXTERNAL_REFERENCE,
  transaction_amount: 9.9,
  transaction_amount_refunded: 0,
};

/** montado, da tabela oficial de status: o mesmo pagamento em cada situação que a Carmine acompanha. */
export const withStatus = (status: string, status_detail: string | null, extra: object = {}) => ({
  ...PAYMENT_APPROVED_PIX,
  status,
  status_detail,
  date_approved: null,
  ...extra,
});

/**
 * montado: resposta de `POST /checkout/preferences`. A página oficial diz que a resposta traz `id`, `init_point` e
 * `sandbox_init_point` (o domínio do exemplo de resposta é o do Mercado Pago); os valores aqui são de mentira.
 */
export const PREFERENCE_CREATED = {
  id: '787997534-6dad21a1-6145-4f0d-ac21-66bf7a5e7a58',
  init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=787997534-6dad21a1',
  sandbox_init_point:
    'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=787997534-6dad21a1',
  external_reference: EXTERNAL_REFERENCE,
};

/**
 * montado: resposta de `GET /v1/payments/search`. A página oficial mostra a resposta embrulhada num array
 * (`[{ paging, results }]`); o adaptador aceita também o objeto direto.
 */
export const searchResponse = (results: object[], wrapped = true) => {
  const page = { paging: { total: results.length, limit: 30, offset: 0 }, results };
  return wrapped ? [page] : page;
};

/**
 * literal: o corpo de uma notificação de pagamento, da página
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export const WEBHOOK_PAYMENT_BODY = {
  id: 12345,
  live_mode: true,
  type: 'payment',
  date_created: '2015-03-25T10:04:58.396-04:00',
  user_id: 44444,
  api_version: 'v1',
  action: 'payment.created',
  data: { id: '999999999' },
};

/**
 * literal (campos): resposta de exemplo de `POST /v1/payments/{id}/refunds`, de
 * https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api-payments/create-refund/post
 */
export const REFUND_CREATED = {
  id: 1,
  payment_id: 5466310457,
  amount: 5,
  metadata: {},
  source: { id: '2', name: 'Carmine', type: 'collector' },
  date_created: '2026-10-28T14:10:00.000-03:00',
  unique_sequence_number: null,
  refund_mode: 'standard',
  adjustment_amount: 0,
  status: 'approved',
  reason: null,
};
