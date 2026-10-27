import { randomBytes, randomUUID } from 'node:crypto';
import type { PaymentMethod, PaymentStatus } from '@carmine/contracts';
import type { Redis } from 'ioredis';
import QRCode from 'qrcode';
import type {
  CreateChargeInput,
  PaymentsGateway,
  ProviderCharge,
  ProviderPayment,
  WebhookCheck,
  WebhookRequest,
} from './gateway.js';
import { signatureHeader, verifyWebhookSignature } from './webhook-signature.js';

/**
 * O segredo do webhook do provedor falso. Não é segredo de verdade: o falso só roda em host de
 * homologação (a configuração recusa o resto), e o que importa é que o webhook do falso passe pela
 * MESMA verificação de assinatura que o do Mercado Pago.
 */
export const FAKE_WEBHOOK_SECRET = 'carmine-provedor-falso-nao-e-segredo';

const KEY_PREFIX = 'fake-payment:';
const RETENTION_SECONDS = 24 * 60 * 60;

/** Quem "paga" no falso. */
export const FAKE_PAYER = {
  name: 'Pagador de Mentira',
  document: '12345678909',
  email: 'pagador@example.invalid',
} as const;

/** O que a página de simulação pode fazer com uma cobrança. */
export const FAKE_ACTIONS = ['pay', 'reject', 'expire', 'refund', 'chargeback'] as const;

export type FakeAction = (typeof FAKE_ACTIONS)[number];

interface FakeCharge {
  id: string;
  externalReference: string;
  amountCents: number;
  method: PaymentMethod;
  status: Exclude<PaymentStatus, 'created'>;
  refundedCents: number;
  expiresAt: string;
  approvedAt: string | null;
  paid: boolean;
}

/** Como o falso entrega um webhook: o corpo e os cabeçalhos já assinados, como o Mercado Pago os mandaria. */
export type WebhookSink = (request: WebhookRequest) => Promise<void>;

/**
 * O provedor de pagamento FALSO (dev, E2E e homologação). Guarda as cobranças no Valkey (1 dia) e
 * uma página de simulação muda o estado delas; cada mudança dispara o webhook assinado contra o
 * tratador de webhooks de verdade (`sink`), então o caminho inteiro (assinatura, consulta, concessão,
 * idempotência) roda sem o Mercado Pago.
 */
export class FakePaymentsGateway implements PaymentsGateway {
  readonly name = 'fake' as const;

  constructor(
    private readonly valkey: Redis,
    private readonly options: {
      /** Onde a página de simulação do web vive (`<origem>/dev/pagamento/<id>`). */
      publicWebUrl: string;
      clock?: () => Date;
      /** Preenchido na montagem do módulo (o tratador de webhooks depende deste gateway). */
      sink?: WebhookSink;
    },
  ) {}

  /** O tratador que recebe os webhooks do falso. */
  attach(sink: WebhookSink): void {
    this.options.sink = sink;
  }

  private now(): Date {
    return this.options.clock?.() ?? new Date();
  }

  async createCharge(input: CreateChargeInput): Promise<ProviderCharge> {
    const id = randomUUID().replaceAll('-', '').slice(0, 16);
    const charge: FakeCharge = {
      id,
      externalReference: input.paymentId,
      amountCents: input.amountCents,
      method: input.method,
      status: 'pending',
      refundedCents: 0,
      expiresAt: input.expiresAt.toISOString(),
      approvedAt: null,
      paid: false,
    };
    await this.save(charge);
    if (input.method !== 'pix')
      return { providerPaymentId: id, redirectUrl: this.simulationUrl(id) };
    const copyPaste = `00020126FAKE${id}5204000053039865406${(input.amountCents / 100).toFixed(2)}5802BR5910CARMINE6009SAO PAULO62070503***6304${randomBytes(2).toString('hex').toUpperCase()}`;
    // Como o Mercado Pago: o QR já vem em PNG (base64), então o web não precisa de biblioteca de QR.
    const png = await QRCode.toBuffer(copyPaste, { type: 'png', margin: 1, width: 280 });
    return {
      providerPaymentId: id,
      pix: { copyPaste, qrCodeBase64: png.toString('base64') },
    };
  }

  /** A página de simulação desta cobrança (no web). */
  simulationUrl(providerPaymentId: string): string {
    return `${this.options.publicWebUrl.replace(/\/+$/, '')}/dev/pagamento/${providerPaymentId}`;
  }

  async getPayment(providerPaymentId: string): Promise<ProviderPayment | null> {
    const charge = await this.load(providerPaymentId);
    if (!charge) return null;
    // Como o Mercado Pago: o Pix que ninguém pagou vence sozinho.
    const lapsed =
      charge.status === 'pending' && Date.parse(charge.expiresAt) <= this.now().getTime();
    const status = lapsed ? 'expired' : charge.status;
    return {
      providerPaymentId: charge.id,
      externalReference: charge.externalReference,
      status,
      amountCents: charge.amountCents,
      refundedCents: charge.refundedCents,
      method: charge.method,
      approvedAt: charge.approvedAt ? new Date(charge.approvedAt) : null,
      payer: charge.paid ? { ...FAKE_PAYER } : null,
    };
  }

  async cancelCharge(providerPaymentId: string): Promise<void> {
    const charge = await this.load(providerPaymentId);
    if (charge?.status === 'pending') await this.save({ ...charge, status: 'cancelled' });
  }

  async refund(providerPaymentId: string, amountCents: number): Promise<void> {
    const charge = await this.load(providerPaymentId);
    if (!charge || !['approved', 'partially_refunded'].includes(charge.status)) {
      throw new Error('o falso só estorna pagamento aprovado');
    }
    await this.refundNow(charge, amountCents);
    await this.notify(charge.id);
  }

  verifyWebhook(request: WebhookRequest): WebhookCheck {
    const requestId = header(request.headers, 'x-request-id');
    const dataId = request.query['data.id'] ?? null;
    const result = verifyWebhookSignature({
      secret: FAKE_WEBHOOK_SECRET,
      header: header(request.headers, 'x-signature') ?? undefined,
      dataId,
      requestId,
      now: request.now ?? this.now(),
    });
    if (!result.valid) return { valid: false, reason: result.reason, requestId };
    if (dataId === null) return { valid: false, reason: 'sem data.id', requestId };
    return { valid: true, topic: request.query.type ?? 'payment', resourceId: dataId, requestId };
  }

  async resolvePaymentId(topic: string, resourceId: string): Promise<string | null> {
    return topic === 'payment' ? resourceId : null;
  }

  /** A página de simulação: muda o estado e entrega o webhook. Devolve o estado depois da ação. */
  async act(providerPaymentId: string, action: FakeAction): Promise<ProviderPayment | null> {
    const charge = await this.load(providerPaymentId);
    if (!charge) return null;
    const at = this.now().toISOString();
    switch (action) {
      case 'pay':
        if (charge.status === 'pending') {
          await this.save({ ...charge, status: 'approved', paid: true, approvedAt: at });
        }
        break;
      case 'reject':
        if (charge.status === 'pending') await this.save({ ...charge, status: 'rejected' });
        break;
      case 'expire':
        if (charge.status === 'pending') {
          await this.save({ ...charge, status: 'expired', expiresAt: at });
        }
        break;
      case 'refund':
        if (['approved', 'partially_refunded'].includes(charge.status)) {
          await this.refundNow(charge, charge.amountCents - charge.refundedCents);
        }
        break;
      case 'chargeback':
        if (['approved', 'partially_refunded', 'refunded'].includes(charge.status)) {
          await this.save({ ...charge, status: 'charged_back' });
        }
        break;
    }
    await this.notify(charge.id);
    return this.getPayment(charge.id);
  }

  /** Entrega o webhook assinado, como o Mercado Pago faria (o `sink` é o tratador de verdade). */
  async notify(providerPaymentId: string): Promise<void> {
    const sink = this.options.sink;
    if (!sink) return;
    const requestId = randomUUID();
    const ts = this.now().getTime();
    await sink({
      headers: {
        'x-request-id': requestId,
        'x-signature': signatureHeader(
          FAKE_WEBHOOK_SECRET,
          { dataId: providerPaymentId, requestId },
          ts,
        ),
      },
      query: { 'data.id': providerPaymentId, type: 'payment' },
      body: { action: 'payment.updated', type: 'payment', data: { id: providerPaymentId } },
      now: this.now(),
    });
  }

  private async refundNow(charge: FakeCharge, amountCents: number): Promise<void> {
    const refundedCents = Math.min(charge.refundedCents + amountCents, charge.amountCents);
    await this.save({
      ...charge,
      refundedCents,
      status: refundedCents >= charge.amountCents ? 'refunded' : 'partially_refunded',
    });
  }

  private async load(id: string): Promise<FakeCharge | null> {
    const raw = await this.valkey.get(KEY_PREFIX + id);
    return raw === null ? null : (JSON.parse(raw) as FakeCharge);
  }

  private async save(charge: FakeCharge): Promise<void> {
    await this.valkey.set(KEY_PREFIX + charge.id, JSON.stringify(charge), 'EX', RETENTION_SECONDS);
  }
}

function header(headers: WebhookRequest['headers'], name: string): string | null {
  const value = headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? null;
}
