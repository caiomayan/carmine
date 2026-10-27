import './zod-jitless.js';
import { z } from 'zod';
import { paymentMethodSchema, paymentStatusSchema } from './payments.js';
import { staffReasonSchema } from './staff.js';

/**
 * Painel da Staff nos pagamentos (S14): a lista com filtro por estado, a ficha do pagamento (o
 * provedor, os valores e os webhooks recebidos), reembolsar, reabrir as compras de uma Conta
 * bloqueada, conciliar com o provedor e a compensação em lote por indisponibilidade. Tudo em
 * `/api/staff/payments*`, com a permissão `payments.manage` (Dono e Admin); toda mutação exige
 * `x-csrf-token` e um motivo, que vai para o log de auditoria (como o CLI `payments ...`).
 */

export const STAFF_PAYMENTS_PAGE_DEFAULT = 30;
export const STAFF_PAYMENTS_PAGE_MAX = 100;

/** A Conta beneficiada de um pagamento, como a Staff a vê. */
export const staffPaymentAccountSchema = z
  .object({
    publicId: z.int().positive(),
    displayName: z.string(),
    /** As compras estão bloqueadas (contestação): a Staff as reabre depois de revisar. */
    purchasesBlocked: z.boolean(),
  })
  .meta({ id: 'StaffPaymentAccount' });

export type StaffPaymentAccount = z.infer<typeof staffPaymentAccountSchema>;

/** Uma linha da lista de pagamentos. */
export const staffPaymentSummarySchema = z
  .object({
    id: z.uuid(),
    status: paymentStatusSchema,
    package: z.string(),
    days: z.int().positive(),
    amountCents: z.int().positive(),
    refundedCents: z.int().nonnegative(),
    method: paymentMethodSchema,
    /** `mercadopago`, ou `fake` (dev e homologação). */
    provider: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
    approvedAt: z.iso.datetime({ offset: true }).nullable(),
    account: staffPaymentAccountSchema,
    /** O nome e o fim do CPF do Pagador, quando o provedor os informou (nunca o CPF inteiro). */
    payerName: z.string().nullable(),
    payerDocumentMasked: z.string().nullable(),
  })
  .meta({ id: 'StaffPaymentSummary' });

export type StaffPaymentSummary = z.infer<typeof staffPaymentSummarySchema>;

/** O filtro da lista: um estado, ou `all`. */
export const staffPaymentFilterSchema = z
  .union([z.literal('all'), paymentStatusSchema])
  .meta({ id: 'StaffPaymentFilter' });

export type StaffPaymentFilter = z.infer<typeof staffPaymentFilterSchema>;

/**
 * `GET /api/staff/payments?status=&before=&limit=`: do mais recente ao mais antigo. `counts` traz
 * quantos pagamentos há em cada estado (para as abas do filtro), sempre o total, não só da página.
 */
export const staffPaymentPageSchema = z
  .object({
    payments: z.array(staffPaymentSummarySchema),
    nextCursor: z.string().nullable(),
    counts: z.partialRecord(paymentStatusSchema, z.int().nonnegative()),
  })
  .meta({ id: 'StaffPaymentPage' });

export type StaffPaymentPage = z.infer<typeof staffPaymentPageSchema>;

/** Um webhook recebido do provedor (o log de `payment_events`). */
export const staffPaymentEventSchema = z
  .object({
    id: z.uuid(),
    receivedAt: z.iso.datetime({ offset: true }),
    topic: z.string().nullable(),
    requestId: z.string().nullable(),
    /** A assinatura conferiu: com `false` a API recusou sem consultar nada. */
    signatureValid: z.boolean(),
    /** O que a API fez: `applied`, `unchanged`, `ignored`, `invalid_signature`, `mismatch` ou `error`. */
    outcome: z.string(),
    detail: z.string().nullable(),
  })
  .meta({ id: 'StaffPaymentEvent' });

export type StaffPaymentEvent = z.infer<typeof staffPaymentEventSchema>;

/** Uma ação da Staff sobre este pagamento (reembolso) ou a Conta dele (reabrir as compras). */
export const staffPaymentAuditSchema = z
  .object({
    id: z.uuid(),
    action: z.string(),
    reason: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
    actorSteamId: z.string(),
    actorName: z.string().nullable(),
    details: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'StaffPaymentAudit' });

export type StaffPaymentAudit = z.infer<typeof staffPaymentAuditSchema>;

/**
 * `GET /api/staff/payments/{id}`: a ficha. `refundable` diz o que ainda dá para devolver (dias e valor
 * de acordo com o Pacote) ou é nulo quando o pagamento não está aprovado. `providerPaymentId` é o id no
 * provedor (para achar a cobrança no painel dele); `vipEndsAt` é o fim do Período que este pagamento gerou.
 */
export const staffPaymentDetailSchema = z
  .object({
    payment: staffPaymentSummarySchema,
    providerPaymentId: z.string().nullable(),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
    refundedDays: z.int().nonnegative(),
    refundedAt: z.iso.datetime({ offset: true }).nullable(),
    chargedBackAt: z.iso.datetime({ offset: true }).nullable(),
    adultDeclaredAt: z.iso.datetime({ offset: true }),
    declarationVersion: z.string(),
    failureReason: z.string().nullable(),
    updatedAt: z.iso.datetime({ offset: true }),
    vipEndsAt: z.iso.datetime({ offset: true }).nullable(),
    purchaseBlock: z
      .object({ at: z.iso.datetime({ offset: true }), reason: z.string().nullable() })
      .nullable(),
    refundable: z.object({ days: z.int().positive(), cents: z.int().positive() }).nullable(),
    events: z.array(staffPaymentEventSchema),
    audit: z.array(staffPaymentAuditSchema),
  })
  .meta({ id: 'StaffPaymentDetail' });

export type StaffPaymentDetail = z.infer<typeof staffPaymentDetailSchema>;

/**
 * `POST /api/staff/payments/{id}/refund`: reembolso pela Staff (depois dos 7 dias, ou parcial por
 * indisponibilidade). `days` é quantos dias do Pacote devolver (o valor é valor × dias ÷ dias do
 * Pacote); sem ele, devolve o que resta. Os dias saem do VIP. Responde com a ficha atualizada.
 */
export const staffPaymentRefundSchema = z
  .strictObject({ reason: staffReasonSchema, days: z.int().min(1).max(3650).optional() })
  .meta({ id: 'StaffPaymentRefund' });

export type StaffPaymentRefund = z.infer<typeof staffPaymentRefundSchema>;

/**
 * `POST /api/staff/accounts/{publicId}/purchases/unblock` (corpo `StaffReasonBody`): reabre as compras de
 * uma Conta bloqueada por contestação. 409 `purchases_not_blocked` se ela não estava bloqueada.
 */
export const staffPurchasesUnblockedSchema = z
  .object({ publicId: z.int().positive() })
  .meta({ id: 'StaffPurchasesUnblocked' });

export type StaffPurchasesUnblocked = z.infer<typeof staffPurchasesUnblockedSchema>;

/** `POST /api/staff/payments/reconcile`: confere com o provedor os pagamentos dos últimos `days` dias. */
export const staffReconcileInputSchema = z
  .strictObject({ days: z.int().min(1).max(400).default(8) })
  .meta({ id: 'StaffReconcileInput' });

export type StaffReconcileInput = z.infer<typeof staffReconcileInputSchema>;

export const staffReconcileResultSchema = z
  .object({ checked: z.int().nonnegative(), changed: z.int().nonnegative() })
  .meta({ id: 'StaffReconcileResult' });

export type StaffReconcileResult = z.infer<typeof staffReconcileResultSchema>;

/** Máximo de dias de uma compensação (a mesma regra do CLI). */
export const COMPENSATION_MAX_DAYS = 30;

/** Uma compensação já aplicada (o log de auditoria `vip_compensation`). */
export const staffCompensationEntrySchema = z
  .object({
    key: z.string(),
    days: z.int().positive(),
    accounts: z.int().nonnegative(),
    reason: z.string(),
    createdAt: z.iso.datetime({ offset: true }),
    actorName: z.string().nullable(),
    actorSteamId: z.string(),
  })
  .meta({ id: 'StaffCompensationEntry' });

export type StaffCompensationEntry = z.infer<typeof staffCompensationEntrySchema>;

/**
 * `GET /api/staff/payments/compensation`: o que a Staff precisa ver antes de compensar: quantas Contas
 * têm VIP ativo agora (as que vão ganhar os dias) e as últimas compensações (para não repetir a queda).
 */
export const staffCompensationOverviewSchema = z
  .object({
    activeVips: z.int().nonnegative(),
    recent: z.array(staffCompensationEntrySchema),
  })
  .meta({ id: 'StaffCompensationOverview' });

export type StaffCompensationOverview = z.infer<typeof staffCompensationOverviewSchema>;

/**
 * `POST /api/staff/payments/compensation` (D4: indisponibilidade acima de 24 h): soma `days` a todos os
 * VIPs ativos de uma vez. `key` é única por queda: repetir a mesma chave não soma de novo (409
 * `compensation_applied`). A API avisa no canal de alertas do Discord.
 */
export const staffCompensationInputSchema = z
  .strictObject({
    days: z.int().min(1).max(COMPENSATION_MAX_DAYS),
    key: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[A-Za-z0-9._:-]+$/, 'só letras, números e . _ : -'),
    reason: staffReasonSchema,
  })
  .meta({ id: 'StaffCompensationInput' });

export type StaffCompensationInput = z.infer<typeof staffCompensationInputSchema>;

export const staffCompensationResultSchema = z
  .object({ accounts: z.int().nonnegative(), days: z.int().positive() })
  .meta({ id: 'StaffCompensationResult' });

export type StaffCompensationResult = z.infer<typeof staffCompensationResultSchema>;
