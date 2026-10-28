import { describe, expect, it } from 'vitest';
import { signatureHeader, WEBHOOK_TOLERANCE_MS } from '../webhook-signature.js';
import {
  EXTERNAL_REFERENCE,
  PAYMENT_APPROVED_CARD,
  PAYMENT_APPROVED_PIX,
  PIX_CREATED,
  PREFERENCE_CREATED,
  REFUND_CREATED,
  searchResponse,
  WEBHOOK_PAYMENT_BODY,
  withStatus,
} from './mercadopago.fixtures.js';
import { MercadoPagoClient, MercadoPagoError } from './mercadopago-client.js';
import { MercadoPagoGateway } from './mercadopago-gateway.js';
import {
  brasiliaIso,
  centsOf,
  methodOf,
  statusOf,
  toProviderPayment,
} from './mercadopago-mapping.js';

const NOW = new Date('2026-10-28T14:00:00.000Z');
const SECRET = 'segredo-de-teste-do-webhook';
const TOKEN = 'APP_USR-token-de-teste-que-nao-pode-vazar';

interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
}

/** Um `fetch` que responde com o que foi gravado, na ordem, e guarda o que o adaptador mandou. */
function recorded(...responses: { status?: number; json?: unknown }[]) {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetcher = (async (input: URL | string, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const next = queue.shift() ?? { status: 500, json: { message: 'sem resposta gravada' } };
    return new Response(next.json === undefined ? '' : JSON.stringify(next.json), {
      status: next.status ?? 200,
    });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function gatewayWith(...responses: { status?: number; json?: unknown }[]) {
  const { fetcher, calls } = recorded(...responses);
  const gateway = new MercadoPagoGateway({
    client: new MercadoPagoClient({ accessToken: TOKEN, fetch: fetcher }),
    webhookSecret: SECRET,
    payerEmailDomain: 'stcarmine.com',
    clock: () => NOW,
  });
  return { gateway, calls };
}

const charge = (over: Partial<Parameters<MercadoPagoGateway['createCharge']>[0]> = {}) => ({
  paymentId: EXTERNAL_REFERENCE,
  amountCents: 990,
  method: 'pix' as const,
  description: 'Saint Carmine · VIP 30 dias',
  expiresAt: new Date(NOW.getTime() + 30 * 60 * 1000),
  backUrl: `https://stcarmine.com/vip/compra/${EXTERNAL_REFERENCE}?retorno=cartao`,
  ...over,
});

describe('valores e datas', () => {
  it('converte reais (número ou texto) em centavos sem erro de ponto flutuante', () => {
    expect(centsOf('24.50')).toBe(2450);
    expect(centsOf(24.5)).toBe(2450);
    expect(centsOf(19.99)).toBe(1999);
    expect(centsOf(9.9)).toBe(990);
    expect(centsOf(null)).toBe(0);
    expect(centsOf(undefined)).toBe(0);
    expect(() => centsOf('abc')).toThrow();
  });

  it('a data sai no formato da documentação, no horário de Brasília', () => {
    expect(brasiliaIso(new Date('2026-10-28T14:00:00.000Z'))).toBe('2026-10-28T11:00:00.000-03:00');
    expect(brasiliaIso(new Date('2026-10-29T01:30:15.250Z'))).toBe('2026-10-28T22:30:15.250-03:00');
  });
});

describe('o estado do pagamento (tabela oficial de status)', () => {
  const state = (status: string, detail: string | null = null, extra: object = {}) =>
    statusOf(withStatus(status, detail, extra));

  it('mapeia cada status do Mercado Pago para o da Carmine', () => {
    expect(state('pending', 'pending_waiting_transfer')).toBe('pending');
    expect(state('approved', 'accredited')).toBe('approved');
    expect(state('authorized', 'pending_capture')).toBe('in_review');
    expect(state('in_process', 'pending_review_manual')).toBe('in_review');
    expect(state('in_mediation', 'pending')).toBe('in_review');
    expect(state('rejected', 'cc_rejected_other_reason')).toBe('rejected');
    expect(state('cancelled', 'by_collector')).toBe('cancelled');
    expect(state('cancelled', 'expired')).toBe('expired');
    expect(state('refunded', 'refunded')).toBe('refunded');
    expect(state('charged_back', 'settled')).toBe('charged_back');
  });

  it('aprovado com algo devolvido é reembolso parcial; devolvido por inteiro, reembolsado', () => {
    expect(state('approved', 'partially_refunded', { transaction_amount_refunded: 3 })).toBe(
      'partially_refunded',
    );
    expect(state('approved', 'partially_refunded')).toBe('partially_refunded');
    expect(state('approved', 'accredited', { transaction_amount_refunded: 9.9 })).toBe('refunded');
  });

  it('um estado que a documentação não lista falha (o aviso volta com 5xx e é reenviado)', () => {
    expect(() => state('estado_novo')).toThrow('status desconhecido');
  });

  it('Pix é Pix (pix ou bank_transfer); o resto conta como cartão', () => {
    expect(methodOf(PAYMENT_APPROVED_PIX)).toBe('pix');
    expect(
      methodOf({
        ...PAYMENT_APPROVED_CARD,
        payment_method_id: undefined,
        payment_type_id: 'bank_transfer',
      }),
    ).toBe('pix');
    expect(methodOf(PAYMENT_APPROVED_CARD)).toBe('card');
  });

  it('o exemplo oficial de cartão aprovado vira o pagamento da porta', () => {
    expect(toProviderPayment(PAYMENT_APPROVED_CARD)).toEqual({
      providerPaymentId: '1',
      externalReference: 'MP0001',
      status: 'approved',
      amountCents: 2450,
      refundedCents: 0,
      method: 'card',
      approvedAt: new Date('2017-08-31T11:26:38.000Z'),
      payer: { name: null, document: '19119119100', email: 'test_payer@example.com' },
    });
  });

  it('o Pix aprovado traz o nome, o CPF e o e-mail do pagador (a Carmine os cifra depois)', () => {
    expect(toProviderPayment(PAYMENT_APPROVED_PIX)).toMatchObject({
      providerPaymentId: '5466310457',
      status: 'approved',
      amountCents: 990,
      method: 'pix',
      payer: { name: 'Maria Silva', document: '19119119100', email: 'pagador@example.com' },
    });
  });

  it('um pendente ainda não tem pagador', () => {
    const pending = toProviderPayment({
      ...withStatus('pending', 'pending_waiting_transfer'),
      payer: null,
    });

    expect(pending.payer).toBeNull();
    expect(pending.approvedAt).toBeNull();
  });
});

describe('criar a cobrança do Pix', () => {
  it('manda o POST /v1/payments como a documentação pede e devolve o QR e o copia e cola', async () => {
    const { gateway, calls } = gatewayWith({ status: 201, json: PIX_CREATED });

    const created = await gateway.createCharge(charge());

    expect(created).toEqual({
      providerPaymentId: '5466310457',
      pix: {
        copyPaste: PIX_CREATED.point_of_interaction.transaction_data.qr_code,
        qrCodeBase64: 'iVBORw0KGgoAAAANSUhEUg...',
      },
    });
    const [call] = calls;
    expect(call).toMatchObject({ method: 'POST', path: '/v1/payments' });
    expect(call?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(call?.headers['x-idempotency-key']).toBe(`charge-${EXTERNAL_REFERENCE}`);
    expect(call?.body).toEqual({
      transaction_amount: 9.9,
      description: 'Saint Carmine · VIP 30 dias',
      payment_method_id: 'pix',
      external_reference: EXTERNAL_REFERENCE,
      // 30 min é o mínimo da documentação: o adaptador pede 31 para não cair abaixo dele.
      date_of_expiration: '2026-10-28T11:31:00.000-03:00',
      payer: { email: `pagamentos+${EXTERNAL_REFERENCE}@stcarmine.com` },
    });
  });

  it('um vencimento mais longo do que o mínimo é respeitado', async () => {
    const { gateway, calls } = gatewayWith({ status: 201, json: PIX_CREATED });

    await gateway.createCharge(charge({ expiresAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000) }));

    expect(
      (calls[0]?.body as { date_of_expiration?: string } | undefined)?.date_of_expiration,
    ).toBe('2026-10-28T13:00:00.000-03:00');
  });

  it('uma resposta sem o copia e cola é erro (a compra é cancelada pela porta)', async () => {
    const { gateway } = gatewayWith({ status: 201, json: { id: 1, status: 'pending' } });

    await expect(gateway.createCharge(charge())).rejects.toThrow('sem o "copia e cola"');
  });

  it('um erro do Mercado Pago sobe como MercadoPagoError, sem o token na mensagem', async () => {
    const { gateway } = gatewayWith({
      status: 400,
      json: {
        message: 'Payer attribute is malformed.',
        error: 'bad_request',
        status: 400,
        cause: [{ code: 4006 }],
      },
    });

    const error = await gateway.createCharge(charge()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MercadoPagoError);
    expect(error).toMatchObject({ status: 400, code: '4006' });
    expect((error as Error).message).not.toContain(TOKEN);
  });
});

describe('criar a cobrança do cartão (Checkout Pro)', () => {
  it('cria a preferência só com cartão, e o providerPaymentId é a referência da nossa cobrança', async () => {
    const { gateway, calls } = gatewayWith({ status: 201, json: PREFERENCE_CREATED });
    const backUrl = `https://stcarmine.com/vip/compra/${EXTERNAL_REFERENCE}?retorno=cartao`;

    const created = await gateway.createCharge(charge({ method: 'card', backUrl }));

    expect(created).toEqual({
      providerPaymentId: `ref:${EXTERNAL_REFERENCE}`,
      redirectUrl: PREFERENCE_CREATED.init_point,
    });
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/checkout/preferences' });
    expect(calls[0]?.body).toEqual({
      items: [
        {
          id: EXTERNAL_REFERENCE,
          title: 'Saint Carmine · VIP 30 dias',
          quantity: 1,
          currency_id: 'BRL',
          unit_price: 9.9,
        },
      ],
      external_reference: EXTERNAL_REFERENCE,
      back_urls: { success: backUrl, pending: backUrl, failure: backUrl },
      auto_return: 'approved',
      binary_mode: true,
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }, { id: 'bank_transfer' }],
      },
      statement_descriptor: 'SAINTCARMINE',
      expires: true,
      expiration_date_from: '2026-10-28T11:00:00.000-03:00',
      expiration_date_to: '2026-10-28T11:31:00.000-03:00',
    });
  });

  it('não manda notification_url: o aviso assinado vem da URL do painel (Suas integrações)', async () => {
    const { gateway, calls } = gatewayWith({ status: 201, json: PREFERENCE_CREATED });

    await gateway.createCharge(charge({ method: 'card' }));

    expect(JSON.stringify(calls[0]?.body)).not.toContain('notification_url');
  });

  it('o descritor da fatura cabe nos 13 caracteres da documentação', async () => {
    const { gateway, calls } = gatewayWith({ status: 201, json: PREFERENCE_CREATED });

    await gateway.createCharge(charge({ method: 'card' }));

    const body = calls[0]?.body as { statement_descriptor?: string } | undefined;
    expect(body?.statement_descriptor?.length).toBeLessThanOrEqual(13);
  });

  it('uma resposta sem o link do checkout é erro', async () => {
    const { gateway } = gatewayWith({ status: 201, json: { id: 'x' } });

    await expect(gateway.createCharge(charge({ method: 'card' }))).rejects.toThrow('sem o link');
  });
});

describe('consultar o pagamento', () => {
  it('o Pix pelo id numérico', async () => {
    const { gateway, calls } = gatewayWith({ json: PAYMENT_APPROVED_PIX });

    const payment = await gateway.getPayment('5466310457');

    expect(payment?.status).toBe('approved');
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/v1/payments/5466310457' });
  });

  it('um pagamento que o Mercado Pago não conhece (404) é nulo; outro erro sobe', async () => {
    const missing = gatewayWith({
      status: 404,
      json: { message: 'Payment not found.', error: 'not_found' },
    });
    expect(await missing.gateway.getPayment('123')).toBeNull();

    const broken = gatewayWith({ status: 500, json: { message: 'erro' } });
    await expect(broken.gateway.getPayment('123')).rejects.toBeInstanceOf(MercadoPagoError);
  });

  it('um id que não é numérico nem uma referência nossa nem chega a ser consultado', async () => {
    const { gateway, calls } = gatewayWith();

    expect(await gateway.getPayment('../../users/me')).toBeNull();
    expect(await gateway.getPayment('ref:nao-e-uuid')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('o cartão procura os pagamentos da referência e fica com o aprovado, não com a tentativa recusada mais nova', async () => {
    const rejected = withStatus('rejected', 'cc_rejected_other_reason', { id: 222 });
    const approved = {
      ...PAYMENT_APPROVED_PIX,
      id: 111,
      payment_type_id: 'credit_card',
      payment_method_id: 'visa',
    };
    const { gateway, calls } = gatewayWith({ json: searchResponse([rejected, approved]) });

    const payment = await gateway.getPayment(`ref:${EXTERNAL_REFERENCE}`);

    expect(payment).toMatchObject({ providerPaymentId: '111', status: 'approved', method: 'card' });
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/v1/payments/search' });
    expect(calls[0]?.query).toEqual({
      external_reference: EXTERNAL_REFERENCE,
      sort: 'date_created',
      criteria: 'desc',
      range: 'date_created',
      begin_date: 'NOW-90DAYS',
      end_date: 'NOW',
    });
  });

  it('aceita a resposta da busca como array (a documentação) ou como objeto, e sem pagamento é nulo', async () => {
    const wrapped = gatewayWith({ json: searchResponse([PAYMENT_APPROVED_PIX], true) });
    const plain = gatewayWith({ json: searchResponse([PAYMENT_APPROVED_PIX], false) });
    const empty = gatewayWith({ json: searchResponse([]) });

    expect((await wrapped.gateway.getPayment(`ref:${EXTERNAL_REFERENCE}`))?.providerPaymentId).toBe(
      '5466310457',
    );
    expect((await plain.gateway.getPayment(`ref:${EXTERNAL_REFERENCE}`))?.providerPaymentId).toBe(
      '5466310457',
    );
    expect(await empty.gateway.getPayment(`ref:${EXTERNAL_REFERENCE}`)).toBeNull();
  });

  it('entre tentativas iguais fica a mais recente (a busca vem do mais novo)', async () => {
    const newer = withStatus('rejected', 'cc_rejected_other_reason', { id: 2 });
    const older = withStatus('rejected', 'cc_rejected_other_reason', { id: 1 });
    const { gateway } = gatewayWith({ json: searchResponse([newer, older]) });

    expect((await gateway.getPayment(`ref:${EXTERNAL_REFERENCE}`))?.providerPaymentId).toBe('2');
  });
});

describe('cancelar', () => {
  it('cancela o Pix pendente com PUT {status: "cancelled"}', async () => {
    const { gateway, calls } = gatewayWith({ json: { id: 5466310457, status: 'cancelled' } });

    await gateway.cancelCharge('5466310457');

    expect(calls[0]).toMatchObject({ method: 'PUT', path: '/v1/payments/5466310457' });
    expect(calls[0]?.body).toEqual({ status: 'cancelled' });
  });

  it('o que não dá mais para cancelar (400) ou não existe (404) não é erro; rede e 5xx sobem', async () => {
    const paid = gatewayWith({ status: 400, json: { message: 'x', cause: [{ code: 2018 }] } });
    const gone = gatewayWith({ status: 404, json: { message: 'Payment not found.' } });
    const down = gatewayWith({ status: 503, json: { message: 'indisponível' } });

    await expect(paid.gateway.cancelCharge('1')).resolves.toBeUndefined();
    await expect(gone.gateway.cancelCharge('1')).resolves.toBeUndefined();
    await expect(down.gateway.cancelCharge('1')).rejects.toBeInstanceOf(MercadoPagoError);
  });

  it('o cartão (referência) não chama nada: a preferência vence sozinha', async () => {
    const { gateway, calls } = gatewayWith();

    await gateway.cancelCharge(`ref:${EXTERNAL_REFERENCE}`);

    expect(calls).toEqual([]);
  });
});

describe('reembolsar', () => {
  it('o reembolso total vai sem amount, com a chave de idempotência', async () => {
    const { gateway, calls } = gatewayWith(
      { json: PAYMENT_APPROVED_PIX },
      { status: 201, json: REFUND_CREATED },
    );

    await gateway.refund('5466310457', 990, `refund-${EXTERNAL_REFERENCE}`);

    expect(calls[1]).toMatchObject({ method: 'POST', path: '/v1/payments/5466310457/refunds' });
    expect(calls[1]?.body).toBeUndefined();
    expect(calls[1]?.headers['content-type']).toBeUndefined();
    expect(calls[1]?.headers['x-idempotency-key']).toBe(`refund-${EXTERNAL_REFERENCE}:990`);
  });

  it('o parcial leva o amount em reais', async () => {
    const { gateway, calls } = gatewayWith(
      { json: PAYMENT_APPROVED_PIX },
      { status: 201, json: REFUND_CREATED },
    );

    await gateway.refund('5466310457', 330, 'refund-x');

    expect(calls[1]?.body).toEqual({ amount: 3.3 });
    expect(calls[1]?.headers['x-idempotency-key']).toBe('refund-x:330');
  });

  it('depois de um parcial, devolver o que resta já é um valor (não um total)', async () => {
    const partial = { ...PAYMENT_APPROVED_PIX, transaction_amount_refunded: 3.3 };
    const { gateway, calls } = gatewayWith(
      { json: partial },
      { status: 201, json: REFUND_CREATED },
    );

    await gateway.refund('5466310457', 660, 'refund-x');

    expect(calls[1]?.body).toEqual({ amount: 6.6 });
  });

  it('o cartão acha o pagamento aprovado pela referência e estorna o id de verdade', async () => {
    const { gateway, calls } = gatewayWith(
      { json: searchResponse([{ ...PAYMENT_APPROVED_PIX, id: 777 }]) },
      { status: 201, json: REFUND_CREATED },
    );

    await gateway.refund(`ref:${EXTERNAL_REFERENCE}`, 990, 'refund-x');

    expect(calls[1]?.path).toBe('/v1/payments/777/refunds');
  });

  it('valor acima do que resta, zero, ou pagamento desconhecido: não chama o estorno', async () => {
    const above = gatewayWith({ json: PAYMENT_APPROVED_PIX });
    const zero = gatewayWith({ json: PAYMENT_APPROVED_PIX });
    const unknown = gatewayWith({ status: 404, json: { message: 'Payment not found.' } });

    await expect(above.gateway.refund('5466310457', 991, 'k')).rejects.toThrow('fora do que resta');
    await expect(zero.gateway.refund('5466310457', 0, 'k')).rejects.toThrow('fora do que resta');
    await expect(unknown.gateway.refund('5466310457', 990, 'k')).rejects.toThrow('não conhece');
    expect(above.calls).toHaveLength(1);
    expect(unknown.calls).toHaveLength(1);
  });

  it('a recusa do Mercado Pago (ex.: 2024, pagamento antigo demais) sobe para a porta tratar', async () => {
    const { gateway } = gatewayWith(
      { json: PAYMENT_APPROVED_PIX },
      { status: 404, json: { message: 'Payment too old to be refunded', cause: [{ code: 2024 }] } },
    );

    await expect(gateway.refund('5466310457', 990, 'k')).rejects.toMatchObject({
      status: 404,
      code: '2024',
    });
  });
});

describe('o webhook', () => {
  const signed = (
    over: { dataId?: string; ts?: number; requestId?: string; secret?: string; body?: object } = {},
  ) => {
    const dataId = over.dataId ?? '999999999';
    const requestId = over.requestId ?? 'req-abc-123';
    return {
      headers: {
        'x-signature': signatureHeader(
          over.secret ?? SECRET,
          { dataId, requestId },
          over.ts ?? NOW.getTime(),
        ),
        'x-request-id': requestId,
      },
      query: { 'data.id': dataId, type: 'payment' },
      body: over.body ?? WEBHOOK_PAYMENT_BODY,
      now: NOW,
    };
  };
  const { gateway } = gatewayWith();

  it('aceita o aviso assinado e devolve o tópico, o id do recurso e o request-id', () => {
    expect(gateway.verifyWebhook(signed())).toEqual({
      valid: true,
      topic: 'payment',
      resourceId: '999999999',
      requestId: 'req-abc-123',
    });
  });

  it('recusa assinatura errada, ausente, malformada ou de outro segredo', () => {
    expect(gateway.verifyWebhook(signed({ secret: 'outro-segredo' }))).toMatchObject({
      valid: false,
      reason: 'assinatura não confere',
    });
    expect(gateway.verifyWebhook({ ...signed(), headers: { 'x-request-id': 'r' } })).toMatchObject({
      valid: false,
      reason: 'sem x-signature',
    });
    expect(
      gateway.verifyWebhook({
        ...signed(),
        headers: { 'x-signature': 'lixo', 'x-request-id': 'r' },
      }),
    ).toMatchObject({ valid: false, reason: 'x-signature malformado' });
  });

  it('a assinatura vale sobre o data.id da URL: trocar o id invalida o aviso', () => {
    const request = signed();

    expect(
      gateway.verifyWebhook({ ...request, query: { ...request.query, 'data.id': '111' } }),
    ).toMatchObject({
      valid: false,
    });
  });

  it('o ts tem tolerância de 5 minutos (antes e depois)', () => {
    const stale = signed({ ts: NOW.getTime() - WEBHOOK_TOLERANCE_MS - 1000 });
    const future = signed({ ts: NOW.getTime() + WEBHOOK_TOLERANCE_MS + 1000 });
    const edge = signed({ ts: NOW.getTime() - WEBHOOK_TOLERANCE_MS + 1000 });

    expect(gateway.verifyWebhook(stale)).toMatchObject({
      valid: false,
      reason: 'ts fora da tolerância',
    });
    expect(gateway.verifyWebhook(future)).toMatchObject({
      valid: false,
      reason: 'ts fora da tolerância',
    });
    expect(gateway.verifyWebhook(edge).valid).toBe(true);
  });

  it('um aviso assinado sem tópico vira "desconhecido" (a porta o ignora)', () => {
    const request = signed({ body: {} });

    expect(gateway.verifyWebhook({ ...request, query: { 'data.id': '999999999' } })).toMatchObject({
      valid: true,
      topic: 'desconhecido',
    });
  });
});

describe('de um aviso ao pagamento a consultar', () => {
  it('o tópico de pagamento é o próprio id (e só se for numérico)', async () => {
    const { gateway, calls } = gatewayWith();

    expect(await gateway.resolvePaymentId('payment', '999999999')).toBe('999999999');
    expect(await gateway.resolvePaymentId('payment', '../x')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('o pedido comercial do Checkout Pro leva à cobrança de cartão pela referência', async () => {
    const { gateway, calls } = gatewayWith({
      json: {
        id: 555,
        external_reference: EXTERNAL_REFERENCE,
        preference_id: 'p',
        payments: [{ id: 9 }],
      },
    });

    expect(await gateway.resolvePaymentId('topic_merchant_order_wh', '555')).toBe(
      `ref:${EXTERNAL_REFERENCE}`,
    );
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/merchant_orders/555' });
  });

  it('sem a conta vendedora conhecida o aviso de contestação é ignorado (a conciliação o pega)', async () => {
    const { gateway, calls } = gatewayWith();

    expect(await gateway.resolvePaymentId('topic_chargebacks_wh', '321')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('com a conta vendedora (o user_id de um aviso assinado) consulta a contestação com X-Caller-Id', async () => {
    const { gateway, calls } = gatewayWith({ json: { id: '321', payments: [5466310457] } });
    const header = signatureHeader(SECRET, { dataId: '999999999', requestId: 'r' }, NOW.getTime());
    gateway.verifyWebhook({
      headers: { 'x-signature': header, 'x-request-id': 'r' },
      query: { 'data.id': '999999999' },
      body: WEBHOOK_PAYMENT_BODY,
      now: NOW,
    });

    expect(await gateway.resolvePaymentId('topic_chargebacks_wh', '321')).toBe('5466310457');
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/v1/chargebacks/321' });
    expect(calls[0]?.headers['x-caller-id']).toBe('44444');
  });

  it('outros tópicos (assinaturas, reclamações...) não são de pagamento', async () => {
    const { gateway } = gatewayWith();

    expect(await gateway.resolvePaymentId('subscription_preapproval', '1')).toBeNull();
    expect(await gateway.resolvePaymentId('desconhecido', '')).toBeNull();
  });
});

describe('o cliente HTTP', () => {
  it('rede fora ou tempo esgotado vira MercadoPagoError com status 0, sem o token', async () => {
    const client = new MercadoPagoClient({
      accessToken: TOKEN,
      fetch: (async () => {
        throw new TypeError(`fetch failed ${TOKEN}`);
      }) as unknown as typeof fetch,
    });

    const error = await client.request('GET', '/v1/payments/1').catch((e: unknown) => e);

    expect(error).toMatchObject({ name: 'MercadoPagoError', status: 0 });
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('resposta que não é JSON em erro não derruba o adaptador', async () => {
    const client = new MercadoPagoClient({
      accessToken: TOKEN,
      fetch: (async () =>
        new Response('<html>bad gateway</html>', { status: 502 })) as unknown as typeof fetch,
    });

    await expect(client.request('GET', '/x')).rejects.toMatchObject({ status: 502 });
  });
});
