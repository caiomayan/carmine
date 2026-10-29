import './zod-jitless.js';
import { z } from 'zod';

/**
 * S14 · Pacotes VIP e pagamentos (docs/specs/mvp.md, ADR de pagamentos). O contrato do que o site
 * mostra e manda; o provedor (Mercado Pago, ou o falso de dev e homologação) fica atrás da porta
 * `Payments` da API e não aparece aqui.
 */

/** Um "mês" do Pacote são 30 dias. */
export const VIP_PACKAGE_MONTH_DAYS = 30;

/** Os Pacotes VIP avulsos. Preço em centavos de real; vale o do momento da compra (fica no pagamento). */
export const VIP_PACKAGES = [
  { id: 'vip-1m', months: 1, days: 30, priceCents: 990 },
  { id: 'vip-3m', months: 3, days: 90, priceCents: 2690 },
  { id: 'vip-6m', months: 6, days: 180, priceCents: 4990 },
] as const;

export const vipPackageIdSchema = z
  .enum(VIP_PACKAGES.map((p) => p.id) as unknown as ['vip-1m', 'vip-3m', 'vip-6m'])
  .meta({ id: 'VipPackageId' });

export type VipPackageId = z.infer<typeof vipPackageIdSchema>;

export const vipPackageSchema = z
  .object({
    id: vipPackageIdSchema,
    months: z.int().positive(),
    days: z.int().positive(),
    priceCents: z.int().positive(),
  })
  .meta({ id: 'VipPackage' });

export type VipPackage = z.infer<typeof vipPackageSchema>;

/** Quanto de VIP a Conta pode ter à frente (compras que passem disso são recusadas). */
export const VIP_MAX_HORIZON_DAYS = 730;

/** Compras criadas por Conta por dia (contando as que não foram pagas). */
export const PURCHASES_PER_DAY_LIMIT = 10;

/** O QR do Pix e o checkout do cartão valem por tanto tempo. */
export const PURCHASE_EXPIRES_MINUTES = 30;

/** Depois de tanto sem confirmação, a tela diz "processando" e mostra o suporte com o identificador (o `id` da compra). */
export const PURCHASE_PROCESSING_MINUTES = 10;

/** Prazo do direito de arrependimento (CDC, art. 49), em dias corridos a partir da aprovação. */
export const REFUND_WINDOW_DAYS = 7;

/** Versão do texto da declaração de maioridade que o Pagador aceita; vai para o pagamento. */
export const ADULT_DECLARATION_VERSION = '2026-10-27';

export const paymentMethodSchema = z.enum(['pix', 'card']).meta({ id: 'PaymentMethod' });

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/**
 * Estados do pagamento (visíveis em "Minhas compras"):
 * - `created`: registrado, ainda sem cobrança no provedor (transitório);
 * - `pending`: aguardando o pagamento (Pix com QR válido, ou cartão no checkout);
 * - `in_review`: o cartão está em análise;
 * - `approved`: pago, o VIP foi concedido;
 * - `rejected`: recusado; `expired`: o QR venceu sem cobrança; `cancelled`: cancelado antes de pagar;
 * - `refunded` / `partially_refunded`: devolvido (total / parte);
 * - `charged_back`: contestado (cartão ou MED do Pix).
 */
export const PAYMENT_STATUSES = [
  'created',
  'pending',
  'in_review',
  'approved',
  'rejected',
  'expired',
  'cancelled',
  'refunded',
  'partially_refunded',
  'charged_back',
] as const;

export const paymentStatusSchema = z.enum(PAYMENT_STATUSES).meta({ id: 'PaymentStatus' });

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/** `POST /api/me/purchases`: o corpo da compra. A declaração de maioridade é obrigatória. */
export const createPurchaseSchema = z
  .object({
    package: vipPackageIdSchema,
    method: paymentMethodSchema,
    /** O Pagador declara ser maior de 18 anos (ADR 0011). */
    adultDeclaration: z.literal(true),
    /** A versão do texto da declaração que a tela mostrou ({@link ADULT_DECLARATION_VERSION}). */
    declarationVersion: z.string().min(1).max(32),
  })
  .meta({ id: 'CreatePurchase' });

export type CreatePurchase = z.infer<typeof createPurchaseSchema>;

/**
 * Se a Conta da sessão pode comprar agora (para o botão já nascer desabilitado, com o motivo):
 * `ok`; `banned` (ban permanente); `purchases_blocked` (a Staff bloqueou depois de uma contestação);
 * `purchase_in_progress` (há um pagamento em análise); `daily_limit` (10 compras em 24 h). O limite de
 * VIP à frente depende do Pacote: some {@link VIP_MAX_HORIZON_DAYS} ao fim do VIP da sessão.
 */
export const PURCHASE_ELIGIBILITY = [
  'ok',
  'banned',
  'purchases_blocked',
  'purchase_in_progress',
  'daily_limit',
] as const;

export const purchaseEligibilitySchema = z
  .enum(PURCHASE_ELIGIBILITY)
  .meta({ id: 'PurchaseEligibility' });

export type PurchaseEligibility = z.infer<typeof purchaseEligibilitySchema>;

/** `GET /api/vip/packages`: o que a página do VIP precisa para mostrar (ou desligar) a compra. */
export const vipPackagesSchema = z
  .object({
    /** A cobrança está ligada (`PAYMENTS_ENABLED`); desligada, o botão vira "Em breve". */
    enabled: z.boolean(),
    /** O provedor é o falso (dev e homologação): a tela avisa que o pagamento é de mentira. */
    sandbox: z.boolean(),
    packages: z.array(vipPackageSchema),
    /** Se a Conta da sessão pode comprar agora; nulo para visitante (sem sessão). */
    eligibility: purchaseEligibilitySchema.nullable(),
  })
  .meta({ id: 'VipPackages' });

export type VipPackages = z.infer<typeof vipPackagesSchema>;

/** O Pix de uma compra pendente. */
export const purchasePixSchema = z
  .object({
    /** O código "copia e cola". O QR é desenhado a partir dele ou de `qrCodeBase64`. */
    copyPaste: z.string().min(1),
    /** O QR em PNG (base64), quando o provedor o devolve. */
    qrCodeBase64: z.string().nullable(),
  })
  .meta({ id: 'PurchasePix' });

/**
 * Uma compra de Pacote VIP, como "Minhas compras" a mostra. `pix` só existe com o Pix pendente;
 * `redirectUrl` só com o cartão pendente (o checkout hospedado do provedor). `simulationUrl` só
 * existe com o provedor falso: a página que simula o pagamento. O CPF do Pagador nunca sai inteiro.
 */
export const purchaseSchema = z
  .object({
    id: z.uuid(),
    status: paymentStatusSchema,
    package: vipPackageIdSchema,
    days: z.int().positive(),
    amountCents: z.int().positive(),
    method: paymentMethodSchema,
    createdAt: z.iso.datetime({ offset: true }),
    /** Até quando o QR (ou o checkout) vale; passado isso, sem cobrança. */
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    approvedAt: z.iso.datetime({ offset: true }).nullable(),
    refundedCents: z.int().nonnegative(),
    pix: purchasePixSchema.nullable(),
    redirectUrl: z.string().nullable(),
    simulationUrl: z.string().nullable(),
    /** `***.***.**1-23`: só o fim do CPF do Pagador (os 3 últimos dígitos), depois de aprovado. */
    payerDocumentMasked: z.string().nullable(),
    /** O nome do Pagador, como o provedor o informa (depois de aprovado). */
    payerName: z.string().nullable(),
    /** Até quando o VIP vai por causa desta compra (o fim do Período que ela gerou); nulo se não gerou (ou se foi desfeito). */
    periodEndsAt: z.iso.datetime({ offset: true }).nullable(),
    /** Até quando o botão "Pedir reembolso" vale (7 dias da aprovação); nulo se não cabe reembolso pelo site. */
    refundableUntil: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'Purchase' });

export type Purchase = z.infer<typeof purchaseSchema>;

export const purchaseListSchema = z
  .object({ purchases: z.array(purchaseSchema) })
  .meta({ id: 'PurchaseList' });

export type PurchaseList = z.infer<typeof purchaseListSchema>;

/** Por que uma compra foi recusada. */
export const PURCHASE_ERROR_CODES = [
  /** A cobrança está desligada. */
  'payments_disabled',
  /** Corpo fora do formato (declaração de maioridade ausente, Pacote desconhecido...). */
  'invalid_body',
  /** A Conta tem ban permanente: o VIP não é vendido. */
  'banned',
  /** A Staff bloqueou as compras da Conta (contestação de pagamento). */
  'purchases_blocked',
  /** O VIP passaria de {@link VIP_MAX_HORIZON_DAYS} dias à frente. */
  'vip_horizon',
  /** Mais de {@link PURCHASES_PER_DAY_LIMIT} compras em 24 h. */
  'daily_limit',
  /** O provedor de pagamento não respondeu. */
  'provider_unavailable',
  /** A compra não existe (ou é de outra Conta). */
  'not_found',
  /** Já há um pagamento da Conta em análise (cartão): espere a resposta. */
  'purchase_in_progress',
  /** O reembolso pelo site não vale (fora dos 7 dias, ou o pagamento não está aprovado). */
  'refund_unavailable',
] as const;

export const purchaseErrorSchema = z
  .object({ code: z.enum(PURCHASE_ERROR_CODES), message: z.string() })
  .meta({ id: 'PurchaseError' });

export type PurchaseError = z.infer<typeof purchaseErrorSchema>;

/** O que a página de simulação do provedor FALSO (dev e homologação) pode fazer com uma cobrança. */
export const FAKE_PAYMENT_ACTIONS = ['pay', 'reject', 'expire', 'refund', 'chargeback'] as const;

export const fakePaymentActionSchema = z.enum(FAKE_PAYMENT_ACTIONS);

export type FakePaymentAction = z.infer<typeof fakePaymentActionSchema>;

/**
 * `GET /api/dev/payments/{providerId}` e o corpo de `POST /api/dev/payments/{providerId}/{action}`: a
 * cobrança no provedor falso. `externalReference` é o `id` da compra (a página volta para
 * `/plans/purchase/<externalReference>`). Só existe com o provedor falso (404 nos outros).
 */
export const fakePaymentSchema = z.object({
  providerPaymentId: z.string(),
  externalReference: z.uuid(),
  status: paymentStatusSchema,
  amountCents: z.int().positive(),
  refundedCents: z.int().nonnegative(),
  method: paymentMethodSchema,
  approvedAt: z.iso.datetime({ offset: true }).nullable(),
  payer: z
    .object({
      name: z.string().nullable(),
      document: z.string().nullable(),
      email: z.string().nullable(),
    })
    .nullable(),
  /** As ações que a página oferece. */
  actions: z.array(fakePaymentActionSchema),
});

export type FakePayment = z.infer<typeof fakePaymentSchema>;
