import type {
  PaymentStatus,
  StaffCompensationEntry,
  StaffCompensationInput,
  StaffCompensationOverview,
  StaffCompensationResult,
  StaffPaymentDetail,
  StaffPaymentFilter,
  StaffPaymentPage,
  StaffPaymentRefund,
  StaffPaymentSummary,
  StaffReconcileResult,
} from '@carmine/contracts';
import { and, count, desc, eq, gt, lt, lte, or, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import {
  accounts,
  paymentEvents,
  payments,
  staffAuditLog,
  vipPeriods,
} from '../database/schema.js';
import { StaffRejection } from '../staff/staff-errors.js';
import { CompensationAlreadyApplied, type VipCompensation } from '../vip/vip-compensation.js';
import { type Payments, PurchaseRejection } from './payments.js';

type PaymentRow = typeof payments.$inferSelect;

/** O cursor da lista não é o que a API devolveu. */
export class InvalidPaymentCursor extends Error {
  constructor() {
    super('cursor inválido');
    this.name = 'InvalidPaymentCursor';
  }
}

/** Quem da Staff age: o SteamID64 (vai no log de auditoria) e o motivo. */
export interface StaffPaymentActor {
  steamId: string;
}

/** Quantos webhooks a ficha mostra (os mais recentes). */
const EVENTS_ON_SHEET = 50;
const RECENT_COMPENSATIONS = 10;

const encodeCursor = (row: Pick<PaymentRow, 'createdAt' | 'id'>) =>
  Buffer.from(`${row.createdAt.getTime()}_${row.id}`).toString('base64url');

function decodeCursor(cursor: string): { at: Date; id: string } {
  const [millis, id] = Buffer.from(cursor, 'base64url').toString().split('_');
  const at = new Date(Number(millis));
  if (!id || Number.isNaN(at.getTime())) throw new InvalidPaymentCursor();
  return { at, id };
}

/**
 * Os pagamentos no painel da Staff (S14): a lista com filtro por estado, a ficha (provedor, valores,
 * webhooks e o que a Staff já fez), reembolsar, reabrir as compras de uma Conta bloqueada, conciliar
 * com o provedor e a compensação em lote. Faz o que o CLI `payments ...` faz, com a mesma regra e o
 * mesmo registro de auditoria: as ações moram em {@link Payments} e {@link VipCompensation}.
 */
export class StaffPayments {
  constructor(
    private readonly db: Database,
    private readonly payments: Payments,
    private readonly compensation: Pick<VipCompensation, 'run'>,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async page(
    filter: StaffPaymentFilter,
    options: { before?: string; limit: number },
  ): Promise<StaffPaymentPage> {
    const cursor = options.before ? decodeCursor(options.before) : null;
    const where = and(
      filter === 'all' ? undefined : eq(payments.status, filter),
      cursor
        ? or(
            lt(payments.createdAt, cursor.at),
            and(eq(payments.createdAt, cursor.at), lt(payments.id, cursor.id)),
          )
        : undefined,
    );
    const rows = await this.db
      .select({
        payment: payments,
        publicId: accounts.publicId,
        displayName: accounts.displayName,
        blockedAt: accounts.purchaseBlockedAt,
      })
      .from(payments)
      .innerJoin(accounts, eq(accounts.id, payments.accountId))
      .where(where)
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(options.limit + 1);
    const slice = rows.slice(0, options.limit);
    const now = this.clock();
    const grouped = await this.db
      .select({ status: payments.status, n: count() })
      .from(payments)
      .groupBy(payments.status);
    return {
      payments: slice.map((row) => this.summary(row, now)),
      nextCursor:
        rows.length > options.limit ? encodeCursor(slice.at(-1)?.payment as PaymentRow) : null,
      counts: Object.fromEntries(grouped.map((g) => [g.status, g.n])) as Partial<
        Record<PaymentStatus, number>
      >,
    };
  }

  async detail(id: string): Promise<StaffPaymentDetail> {
    const [found] = await this.db
      .select({
        payment: payments,
        publicId: accounts.publicId,
        displayName: accounts.displayName,
        blockedAt: accounts.purchaseBlockedAt,
        blockReason: accounts.purchaseBlockReason,
      })
      .from(payments)
      .innerJoin(accounts, eq(accounts.id, payments.accountId))
      .where(eq(payments.id, id));
    if (!found) throw new StaffRejection('payment_not_found', 'Pagamento não encontrado');
    const row = found.payment;
    const now = this.clock();

    const [events, audit, period] = await Promise.all([
      this.db
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.paymentId, id))
        .orderBy(desc(paymentEvents.receivedAt))
        .limit(EVENTS_ON_SHEET),
      this.db
        .select({
          entry: staffAuditLog,
          actorName: accounts.displayName,
        })
        .from(staffAuditLog)
        .leftJoin(accounts, eq(accounts.steamId, staffAuditLog.actorSteamId))
        .where(
          or(
            sql`${staffAuditLog.details}->>'paymentId' = ${id}`,
            // Reabrir as compras é da Conta, não do pagamento: aparece em todos os dela.
            and(
              eq(staffAuditLog.action, 'purchase_unblock'),
              eq(staffAuditLog.targetAccountId, row.accountId),
            ),
          ),
        )
        .orderBy(desc(staffAuditLog.createdAt))
        .limit(50),
      this.db
        .select({ endsAt: vipPeriods.endsAt })
        .from(vipPeriods)
        .where(eq(vipPeriods.paymentId, id)),
    ]);

    const remainingDays = row.days - row.refundedDays;
    const remainingCents = row.amountCents - row.refundedCents;
    const refundable =
      ['approved', 'partially_refunded'].includes(row.status) &&
      row.providerPaymentId !== null &&
      remainingDays > 0 &&
      remainingCents > 0
        ? { days: remainingDays, cents: remainingCents }
        : null;

    return {
      payment: this.summary(found, now),
      providerPaymentId: row.providerPaymentId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      refundedDays: row.refundedDays,
      refundedAt: row.refundedAt?.toISOString() ?? null,
      chargedBackAt: row.chargedBackAt?.toISOString() ?? null,
      adultDeclaredAt: row.adultDeclaredAt.toISOString(),
      declarationVersion: row.declarationVersion,
      failureReason: row.failureReason,
      updatedAt: row.updatedAt.toISOString(),
      vipEndsAt: period[0]?.endsAt.toISOString() ?? null,
      purchaseBlock: found.blockedAt
        ? { at: found.blockedAt.toISOString(), reason: found.blockReason }
        : null,
      refundable,
      events: events.map((event) => ({
        id: event.id,
        receivedAt: event.receivedAt.toISOString(),
        topic: event.topic,
        requestId: event.requestId,
        signatureValid: event.signatureValid,
        outcome: event.outcome,
        detail: event.detail,
      })),
      audit: audit.map(({ entry, actorName }) => ({
        id: entry.id,
        action: entry.action,
        reason: entry.reason,
        createdAt: entry.createdAt.toISOString(),
        actorSteamId: entry.actorSteamId.toString(),
        actorName,
        details: entry.details,
      })),
    };
  }

  /** Reembolso pela Staff (a mesma regra do CLI); responde com a ficha atualizada. */
  async refund(
    actor: StaffPaymentActor,
    id: string,
    body: StaffPaymentRefund,
  ): Promise<StaffPaymentDetail> {
    try {
      await this.payments.refundByStaff(
        id,
        { actorSteamId: actor.steamId, reason: body.reason },
        body.days === undefined ? {} : { days: body.days },
      );
    } catch (error) {
      throw translate(error);
    }
    return this.detail(id);
  }

  /** Reabre as compras de uma Conta bloqueada por contestação; devolve o ID público. */
  async unblock(actor: StaffPaymentActor, publicId: number, reason: string): Promise<number> {
    const [account] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.publicId, publicId));
    if (!account) throw new StaffRejection('account_not_found', 'Conta não encontrada');
    const done = await this.payments.unblockPurchases(account.id, {
      actorSteamId: actor.steamId,
      reason,
    });
    if (!done) {
      throw new StaffRejection(
        'purchases_not_blocked',
        'As compras desta Conta não estavam bloqueadas',
      );
    }
    return publicId;
  }

  /** Confere com o provedor os pagamentos dos últimos `days` dias (pega reembolso e contestação sem webhook). */
  async reconcile(days: number): Promise<StaffReconcileResult> {
    const since = new Date(this.clock().getTime() - days * 24 * 60 * 60 * 1000);
    return this.payments.reconcile({ since });
  }

  async compensationOverview(): Promise<StaffCompensationOverview> {
    const now = this.clock();
    const [active] = await this.db
      .select({ n: sql<number>`count(distinct ${vipPeriods.accountId})::int` })
      .from(vipPeriods)
      .where(and(lte(vipPeriods.startsAt, now), gt(vipPeriods.endsAt, now)));
    const rows = await this.db
      .select({ entry: staffAuditLog, actorName: accounts.displayName })
      .from(staffAuditLog)
      .leftJoin(accounts, eq(accounts.steamId, staffAuditLog.actorSteamId))
      .where(eq(staffAuditLog.action, 'vip_compensation'))
      .orderBy(desc(staffAuditLog.createdAt))
      .limit(RECENT_COMPENSATIONS);
    const recent: StaffCompensationEntry[] = rows.map(({ entry, actorName }) => ({
      key: String(entry.details.key ?? ''),
      days: Number(entry.details.days ?? 0) || 1,
      accounts: Number(entry.details.accounts ?? 0),
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
      actorName,
      actorSteamId: entry.actorSteamId.toString(),
    }));
    return { activeVips: active?.n ?? 0, recent };
  }

  /** Soma os dias a todos os VIPs ativos (idempotente pela chave); a API avisa no Discord. */
  async compensate(
    actor: StaffPaymentActor,
    input: StaffCompensationInput,
  ): Promise<StaffCompensationResult> {
    try {
      return await this.compensation.run(
        { days: input.days, key: input.key },
        { actorSteamId: actor.steamId, reason: input.reason },
      );
    } catch (error) {
      throw translate(error);
    }
  }

  private summary(
    found: {
      payment: PaymentRow;
      publicId: number;
      displayName: string;
      blockedAt: Date | null;
    },
    now: Date,
  ): StaffPaymentSummary {
    const row = found.payment;
    const view = this.payments.view(row, now);
    return {
      id: row.id,
      // O estado gravado: para a Staff ele é a verdade (a varredura marca o vencido em até 1 minuto).
      status: row.status,
      package: row.package,
      days: row.days,
      amountCents: row.amountCents,
      refundedCents: row.refundedCents,
      method: row.method,
      provider: row.provider,
      createdAt: row.createdAt.toISOString(),
      approvedAt: row.approvedAt?.toISOString() ?? null,
      account: {
        publicId: found.publicId,
        displayName: found.displayName,
        purchasesBlocked: found.blockedAt !== null,
      },
      payerName: row.payerName,
      payerDocumentMasked: view.payerDocumentMasked,
    };
  }
}

/** As recusas do pagamento e da compensação viram o código estável do painel. */
function translate(error: unknown): unknown {
  if (error instanceof PurchaseRejection) {
    switch (error.code) {
      case 'not_found':
        return new StaffRejection('payment_not_found', error.message);
      case 'refund_unavailable':
        return new StaffRejection('payment_not_refundable', error.message);
      case 'provider_unavailable':
        return new StaffRejection('payment_provider_unavailable', error.message);
      default:
        return error;
    }
  }
  if (error instanceof CompensationAlreadyApplied) {
    return new StaffRejection('compensation_applied', error.message);
  }
  return error;
}
