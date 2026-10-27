import { randomUUID } from 'node:crypto';
import {
  ADULT_DECLARATION_VERSION,
  type CreatePurchase,
  PURCHASE_EXPIRES_MINUTES,
  PURCHASES_PER_DAY_LIMIT,
  type Purchase,
  type PurchaseEligibility,
  type PurchaseError,
  REFUND_WINDOW_DAYS,
  VIP_MAX_HORIZON_DAYS,
  VIP_PACKAGES,
  type VipPackages,
} from '@carmine/contracts';
import { and, count, desc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, paymentEvents, payments, sanctions, vipPeriods } from '../database/schema.js';
import { recordStaffAudit, type StaffAction } from '../staff/audit-log.js';
import type { VipPeriods } from '../vip/vip-periods.js';
import type { PaymentsGateway, ProviderPayment, WebhookRequest } from './gateway.js';
import { decryptDocument, encryptDocument, last3Of, maskDocument } from './payer-document.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type PaymentRow = typeof payments.$inferSelect;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Uma compra recusada, com o código que o web mostra. */
export class PurchaseRejection extends Error {
  constructor(
    readonly code: PurchaseError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'PurchaseRejection';
  }
}

export type ApplyOutcome = 'applied' | 'unchanged' | 'ignored' | 'mismatch';

export interface PaymentsOptions {
  db: Database;
  /** Nulo: nenhum provedor configurado (a compra fica indisponível). */
  gateway: PaymentsGateway | null;
  vip: VipPeriods;
  enabled: boolean;
  /** Cifra o CPF do Pagador; nulo: o CPF não é guardado (só o nome). */
  dataKey: Buffer | null;
  publicWebUrl: string;
  /** Aviso para a Staff (Discord); nunca lança. */
  alert?: (message: string) => Promise<unknown>;
  /** O VIP da Conta mudou: limpa o `equipped/v5` em cache, etc. Nunca lança. */
  onVipChanged?: (accountId: string) => Promise<unknown>;
  clock?: () => Date;
}

/**
 * Os Pacotes VIP (S14): compra, ciclo de vida do pagamento, webhook, vencimento e conciliação,
 * reembolso e contestação. O VIP só nasce de {@link applyProvider}, a partir do que o PROVEDOR diz
 * (`getPayment`), numa transação que trava o pagamento: o mesmo aviso duas vezes, ou o aviso e a
 * conciliação juntos, concedem uma vez só. Ver docs/adr (pagamentos) e a proposta da S14.
 */
export class Payments {
  private readonly db: Database;
  private readonly clock: () => Date;

  constructor(private readonly options: PaymentsOptions) {
    this.db = options.db;
    this.clock = options.clock ?? (() => new Date());
  }

  /** A cobrança está ligada e há provedor. */
  get available(): boolean {
    return this.options.enabled && this.options.gateway !== null;
  }

  async catalog(accountId: string | null = null, now = this.clock()): Promise<VipPackages> {
    return {
      enabled: this.available,
      sandbox: this.options.gateway?.name === 'fake',
      packages: VIP_PACKAGES.map((p) => ({ ...p })),
      eligibility: accountId === null ? null : await this.eligibility(accountId, now),
    };
  }

  /** Se a Conta pode comprar agora, na mesma ordem em que `create` recusa. */
  async eligibility(accountId: string, now = this.clock()): Promise<PurchaseEligibility> {
    const [account] = await this.db
      .select({ blockedAt: accounts.purchaseBlockedAt })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (await this.hasPermanentBan(this.db, accountId)) return 'banned';
    if (account?.blockedAt) return 'purchases_blocked';
    const [open] = await this.db
      .select({ n: count() })
      .from(payments)
      .where(and(eq(payments.accountId, accountId), eq(payments.status, 'in_review')));
    if ((open?.n ?? 0) > 0) return 'purchase_in_progress';
    const [recent] = await this.db
      .select({ n: count() })
      .from(payments)
      .where(
        and(
          eq(payments.accountId, accountId),
          gt(payments.createdAt, new Date(now.getTime() - DAY_MS)),
        ),
      );
    return (recent?.n ?? 0) >= PURCHASES_PER_DAY_LIMIT ? 'daily_limit' : 'ok';
  }

  // --- Compra -------------------------------------------------------------------------------------

  async create(
    accountId: string,
    input: CreatePurchase,
    idempotencyKey: string | null,
    now = this.clock(),
  ): Promise<Purchase> {
    const gateway = this.options.gateway;
    if (!this.options.enabled || gateway === null) {
      throw new PurchaseRejection('payments_disabled', 'A compra do VIP ainda não está aberta');
    }
    const pkg = VIP_PACKAGES.find((p) => p.id === input.package);
    if (!pkg) throw new PurchaseRejection('invalid_body', 'Pacote desconhecido');

    const key = idempotencyKey ?? randomUUID();
    const { row, reused, toCancel } = await this.db.transaction(async (tx) => {
      // Serializa as compras da Conta: duas abas não criam dois pendentes.
      const [account] = await tx
        .select({
          blockedAt: accounts.purchaseBlockedAt,
          anonymizedAt: accounts.anonymizedAt,
        })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!account || account.anonymizedAt !== null) {
        throw new PurchaseRejection('not_found', 'Conta não encontrada');
      }
      const known = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.accountId, accountId), eq(payments.idempotencyKey, key)));
      if (known[0]) return { row: known[0], reused: true, toCancel: [] as string[] };

      if (account.blockedAt !== null) {
        throw new PurchaseRejection(
          'purchases_blocked',
          'As compras desta Conta estão suspensas; fale com a Staff',
        );
      }
      if (await this.hasPermanentBan(tx, accountId)) {
        throw new PurchaseRejection('banned', 'Uma Conta com ban permanente não compra VIP');
      }
      const status = await this.options.vip.statusOf(accountId, now);
      const end = (status.endsAt ?? now).getTime() + pkg.days * DAY_MS;
      if (end - now.getTime() > VIP_MAX_HORIZON_DAYS * DAY_MS) {
        throw new PurchaseRejection(
          'vip_horizon',
          `O VIP não pode passar de ${VIP_MAX_HORIZON_DAYS} dias à frente`,
        );
      }

      const open = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.accountId, accountId),
            inArray(payments.status, ['created', 'pending', 'in_review']),
            or(isNull(payments.expiresAt), gt(payments.expiresAt, now)),
          ),
        )
        .orderBy(desc(payments.createdAt));
      if (open.some((p) => p.status === 'in_review')) {
        throw new PurchaseRejection(
          'purchase_in_progress',
          'Há um pagamento seu em análise; espere a resposta',
        );
      }
      const same = open.find(
        (p) => p.status === 'pending' && p.package === pkg.id && p.method === input.method,
      );
      if (same) return { row: same, reused: true, toCancel: [] as string[] };

      const [recent] = await tx
        .select({ n: count() })
        .from(payments)
        .where(
          and(
            eq(payments.accountId, accountId),
            gt(payments.createdAt, new Date(now.getTime() - DAY_MS)),
          ),
        );
      if ((recent?.n ?? 0) >= PURCHASES_PER_DAY_LIMIT) {
        throw new PurchaseRejection('daily_limit', 'Muitas compras hoje; tente amanhã');
      }

      // Outro Pacote ou meio: o pendente anterior sai de cena.
      const stale = open.filter((p) => p.status !== 'in_review');
      if (stale.length > 0) {
        await tx
          .update(payments)
          .set({
            status: 'cancelled',
            failureReason: 'substituída por outra compra',
            updatedAt: now,
          })
          .where(
            inArray(
              payments.id,
              stale.map((p) => p.id),
            ),
          );
      }
      const [created] = await tx
        .insert(payments)
        .values({
          accountId,
          package: pkg.id,
          days: pkg.days,
          amountCents: pkg.priceCents,
          method: input.method,
          provider: gateway.name,
          expiresAt: new Date(now.getTime() + PURCHASE_EXPIRES_MINUTES * MINUTE_MS),
          adultDeclaredAt: now,
          declarationVersion: input.declarationVersion || ADULT_DECLARATION_VERSION,
          idempotencyKey: key,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return {
        row: created as PaymentRow,
        reused: false,
        toCancel: stale.flatMap((p) => (p.providerPaymentId ? [p.providerPaymentId] : [])),
      };
    });

    for (const providerId of toCancel)
      await gateway.cancelCharge(providerId).catch(() => undefined);
    if (reused || row.status !== 'created') return this.viewOf(row, now);

    try {
      const charge = await gateway.createCharge({
        paymentId: row.id,
        amountCents: row.amountCents,
        method: row.method,
        description: `Saint Carmine · VIP ${row.days} dias`,
        expiresAt: row.expiresAt as Date,
        backUrl: `${this.options.publicWebUrl}/vip/compra/${row.id}?retorno=cartao`,
      });
      const [updated] = await this.db
        .update(payments)
        .set({
          status: 'pending',
          providerPaymentId: charge.providerPaymentId,
          pixCopyPaste: charge.pix?.copyPaste ?? null,
          pixQrBase64: charge.pix?.qrCodeBase64 ?? null,
          redirectUrl: charge.redirectUrl ?? null,
          updatedAt: now,
        })
        .where(eq(payments.id, row.id))
        .returning();
      return this.viewOf(updated as PaymentRow, now);
    } catch (error) {
      await this.db
        .update(payments)
        .set({
          status: 'cancelled',
          failureReason: `provedor: ${(error as Error).message}`.slice(0, 200),
          updatedAt: now,
        })
        .where(eq(payments.id, row.id));
      throw new PurchaseRejection(
        'provider_unavailable',
        'O provedor de pagamento não respondeu; tente de novo em instantes',
      );
    }
  }

  async get(accountId: string, id: string, now = this.clock()): Promise<Purchase> {
    const row = await this.own(accountId, id);
    return this.viewOf(row, now);
  }

  async list(accountId: string, now = this.clock()): Promise<Purchase[]> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(and(eq(payments.accountId, accountId), sql`${payments.status} <> 'created'`))
      .orderBy(desc(payments.createdAt))
      .limit(100);
    const ends = await this.periodEnds(rows.map((row) => row.id));
    return rows.map((row) => this.view(row, now, ends.get(row.id) ?? null));
  }

  /** A tela de uma compra pendente pergunta ao provedor, sem esperar o webhook. */
  async refresh(accountId: string, id: string, now = this.clock()): Promise<Purchase> {
    const row = await this.own(accountId, id);
    if (['created', 'pending', 'in_review'].includes(row.status) && row.providerPaymentId) {
      await this.sync(row.id, now).catch(() => undefined);
      return this.viewOf(await this.own(accountId, id), now);
    }
    return this.viewOf(row, now);
  }

  // --- Reembolso ----------------------------------------------------------------------------------

  /**
   * O direito de arrependimento (CDC, art. 49), pelo site: 100% do valor, sem motivo, em até
   * {@link REFUND_WINDOW_DAYS} dias da aprovação. A API estorna no provedor e os dias do Pacote saem
   * do VIP quando o provedor confirma.
   */
  async refund(accountId: string, id: string, now = this.clock()): Promise<Purchase> {
    const gateway = this.options.gateway;
    const row = await this.own(accountId, id);
    const within =
      row.approvedAt !== null &&
      now.getTime() - row.approvedAt.getTime() <= REFUND_WINDOW_DAYS * DAY_MS;
    if (row.status !== 'approved' || !within || !row.providerPaymentId || gateway === null) {
      throw new PurchaseRejection(
        'refund_unavailable',
        'Este pagamento não pode ser reembolsado pelo site; fale com a Staff',
      );
    }
    try {
      await gateway.refund(
        row.providerPaymentId,
        row.amountCents - row.refundedCents,
        `refund-${row.id}`,
      );
    } catch {
      throw new PurchaseRejection(
        'provider_unavailable',
        'O provedor não confirmou o estorno; tente de novo',
      );
    }
    await this.sync(row.id, now);
    return this.viewOf(await this.own(accountId, id), now);
  }

  /**
   * Reembolso pela Staff (depois dos 7 dias, ou parcial por indisponibilidade). `days` indica quantos
   * dias do Pacote devolver (o valor é valor × dias ÷ dias do Pacote); sem `days`, o que resta. Os dias
   * saem do VIP e a ação fica no log de auditoria.
   */
  async refundByStaff(
    paymentId: string,
    staff: StaffAction,
    options: { days?: number } = {},
    now = this.clock(),
  ): Promise<Purchase> {
    const gateway = this.options.gateway;
    const [row] = await this.db.select().from(payments).where(eq(payments.id, paymentId));
    if (!row) throw new PurchaseRejection('not_found', 'Pagamento não encontrado');
    if (
      !['approved', 'partially_refunded'].includes(row.status) ||
      !row.providerPaymentId ||
      gateway === null
    ) {
      throw new PurchaseRejection('refund_unavailable', 'Só se reembolsa pagamento aprovado');
    }
    const remainingDays = row.days - row.refundedDays;
    const days = Math.min(options.days ?? remainingDays, remainingDays);
    if (days <= 0) throw new PurchaseRejection('refund_unavailable', 'Não há dias a devolver');
    const amount =
      days === remainingDays
        ? row.amountCents - row.refundedCents
        : Math.round((row.amountCents * days) / row.days);
    try {
      await gateway.refund(
        row.providerPaymentId,
        amount,
        `refund-${row.id}-${row.refundedDays + days}`,
      );
    } catch {
      throw new PurchaseRejection('provider_unavailable', 'O provedor não confirmou o estorno');
    }
    await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, row.id))
        .for('update');
      if (!locked) return;
      const removedDays = Math.min(days, locked.days - locked.refundedDays);
      await this.options.vip.removePackage(tx, row.id, removedDays);
      // O webhook do estorno pode ter chegado antes: parte do que o pagamento já tinha ANTES do estorno.
      const refundedCents = Math.min(
        Math.max(locked.refundedCents, row.refundedCents + amount),
        locked.amountCents,
      );
      await tx
        .update(payments)
        .set({
          refundedCents,
          refundedDays: locked.refundedDays + removedDays,
          refundedAt: now,
          status: refundedCents >= locked.amountCents ? 'refunded' : 'partially_refunded',
          updatedAt: now,
        })
        .where(eq(payments.id, row.id));
      await recordStaffAudit(tx, {
        action: 'payment_refund',
        staff,
        target: {
          accountId: locked.accountId,
          steamId: await this.steamIdOf(tx, locked.accountId),
        },
        details: {
          paymentId: row.id,
          days: removedDays,
          amountCents: amount,
          package: row.package,
        },
        at: now,
      });
    });
    await this.safely(() => this.options.onVipChanged?.(row.accountId));
    await this.sync(row.id, now).catch(() => undefined);
    const [after] = await this.db.select().from(payments).where(eq(payments.id, row.id));
    return this.viewOf(after as PaymentRow, now);
  }

  /** A Staff reabre as compras de uma Conta bloqueada (contestação revisada). */
  async unblockPurchases(
    accountId: string,
    staff: StaffAction,
    now = this.clock(),
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ steamId: accounts.steamId, blockedAt: accounts.purchaseBlockedAt })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!account || account.blockedAt === null) return false;
      await tx
        .update(accounts)
        .set({ purchaseBlockedAt: null, purchaseBlockReason: null })
        .where(eq(accounts.id, accountId));
      await recordStaffAudit(tx, {
        action: 'purchase_unblock',
        staff,
        target: { accountId, steamId: account.steamId },
        details: {},
        at: now,
      });
      return true;
    });
  }

  // --- Webhook e sincronização ----------------------------------------------------------------------

  /**
   * Um webhook do provedor. Assinatura inválida: registra e recusa (`rejected`), sem consultar nada.
   * Válido: consulta o pagamento no provedor (o corpo nunca vale) e aplica. Erro nosso: lança, para o
   * provedor reenviar.
   */
  async handleWebhook(request: WebhookRequest): Promise<{ result: 'accepted' | 'rejected' }> {
    const gateway = this.options.gateway;
    const now = request.now ?? this.clock();
    if (gateway === null) return { result: 'rejected' };
    const check = gateway.verifyWebhook({ ...request, now });
    if (!check.valid) {
      await this.logEvent({
        provider: gateway.name,
        requestId: check.requestId,
        signatureValid: false,
        outcome: 'invalid_signature',
        detail: check.reason,
        now,
      });
      await this.noteInvalidSignature(now);
      return { result: 'rejected' };
    }
    let paymentId: string | null = null;
    try {
      const providerId = await gateway.resolvePaymentId(check.topic, check.resourceId);
      if (providerId === null) {
        await this.logEvent({
          provider: gateway.name,
          requestId: check.requestId,
          topic: check.topic,
          resourceId: check.resourceId,
          signatureValid: true,
          outcome: 'ignored',
          detail: 'aviso que não é de pagamento',
          now,
        });
        return { result: 'accepted' };
      }
      const remote = await gateway.getPayment(providerId);
      const row = remote ? await this.findFor(remote) : null;
      paymentId = row?.id ?? null;
      const outcome =
        remote && row ? (await this.applyProvider(row.id, remote, now)).outcome : 'ignored';
      await this.logEvent({
        provider: gateway.name,
        requestId: check.requestId,
        topic: check.topic,
        resourceId: check.resourceId,
        signatureValid: true,
        paymentId,
        outcome,
        detail: remote ? null : 'o provedor não conhece este pagamento',
        now,
      });
      return { result: 'accepted' };
    } catch (error) {
      await this.logEvent({
        provider: gateway.name,
        requestId: check.requestId,
        topic: check.topic,
        resourceId: check.resourceId,
        signatureValid: true,
        paymentId,
        outcome: 'error',
        detail: (error as Error).message.slice(0, 300),
        now,
      }).catch(() => undefined);
      throw error;
    }
  }

  /** Pergunta ao provedor pelo pagamento e aplica o que ele diz. */
  async sync(id: string, now = this.clock()): Promise<ApplyOutcome> {
    const gateway = this.options.gateway;
    const [row] = await this.db.select().from(payments).where(eq(payments.id, id));
    if (!row || gateway === null || row.providerPaymentId === null) return 'ignored';
    const remote = await gateway.getPayment(row.providerPaymentId);
    if (!remote) return 'ignored';
    return (await this.applyProvider(row.id, remote, now)).outcome;
  }

  /**
   * Aplica o estado do provedor ao pagamento, numa transação que o trava. Só avança (um pendente não
   * volta de aprovado); o aprovado concede o VIP uma vez; reembolso total e contestação tiram os dias
   * do Pacote que ainda não saíram; a contestação também bloqueia novas compras da Conta.
   */
  async applyProvider(
    id: string,
    remote: ProviderPayment,
    now = this.clock(),
  ): Promise<{ outcome: ApplyOutcome; accountId: string | null }> {
    let alert: string | null = null;
    let vipChanged = false;
    const result = await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(payments).where(eq(payments.id, id)).for('update');
      if (!row) return { outcome: 'ignored' as const, accountId: null };
      const open = ['created', 'pending', 'in_review'];
      const closedUnpaid = ['expired', 'cancelled', 'rejected'];
      const paid = ['approved', 'partially_refunded', 'refunded'];
      let outcome: ApplyOutcome = 'unchanged';
      const base = {
        updatedAt: now,
        providerPaymentId: row.providerPaymentId ?? remote.providerPaymentId,
      };

      switch (remote.status) {
        case 'approved': {
          if (!open.includes(row.status) && !closedUnpaid.includes(row.status)) break;
          if (remote.amountCents !== row.amountCents) {
            outcome = 'mismatch';
            alert = `Pagamento ${row.id}: o provedor aprovou R$ ${(remote.amountCents / 100).toFixed(2)}, o esperado era R$ ${(row.amountCents / 100).toFixed(2)}. Nada foi concedido.`;
            break;
          }
          // O dinheiro entrou: vale até para o que já tínhamos expirado ou cancelado.
          await this.options.vip.grantPackage(tx, row.accountId, row.days, row.id, now);
          await tx
            .update(payments)
            .set({
              ...base,
              ...this.payerFields(remote),
              status: 'approved',
              approvedAt: remote.approvedAt ?? now,
            })
            .where(eq(payments.id, row.id));
          outcome = 'applied';
          vipChanged = true;
          break;
        }
        case 'in_review':
          if (row.status === 'created' || row.status === 'pending') {
            await tx
              .update(payments)
              .set({ ...base, status: 'in_review' })
              .where(eq(payments.id, row.id));
            outcome = 'applied';
          }
          break;
        case 'pending':
          if (row.status === 'created') {
            await tx
              .update(payments)
              .set({ ...base, status: 'pending' })
              .where(eq(payments.id, row.id));
            outcome = 'applied';
          }
          break;
        case 'rejected':
        case 'expired':
        case 'cancelled':
          if (open.includes(row.status)) {
            await tx
              .update(payments)
              .set({ ...base, status: remote.status })
              .where(eq(payments.id, row.id));
            outcome = 'applied';
          }
          break;
        case 'refunded':
          if (row.status === 'approved' || row.status === 'partially_refunded') {
            const remaining = row.days - row.refundedDays;
            if (remaining > 0) await this.options.vip.removePackage(tx, row.id, remaining);
            await tx
              .update(payments)
              .set({
                ...base,
                status: 'refunded',
                refundedCents: row.amountCents,
                refundedDays: row.days,
                refundedAt: row.refundedAt ?? now,
              })
              .where(eq(payments.id, row.id));
            outcome = 'applied';
            vipChanged = true;
          }
          break;
        case 'partially_refunded':
          if (
            (row.status === 'approved' || row.status === 'partially_refunded') &&
            remote.refundedCents > row.refundedCents
          ) {
            // Parcial feito fora da nossa ação (no painel do provedor): registra o valor; os dias a Staff ajusta.
            await tx
              .update(payments)
              .set({
                ...base,
                status: 'partially_refunded',
                refundedCents: remote.refundedCents,
                refundedAt: now,
              })
              .where(eq(payments.id, row.id));
            alert = `Pagamento ${row.id}: estorno parcial de R$ ${(remote.refundedCents / 100).toFixed(2)} feito direto no provedor. Ajuste os dias de VIP se for o caso.`;
            outcome = 'applied';
          }
          break;
        case 'charged_back':
          if (paid.includes(row.status)) {
            const remaining = row.days - row.refundedDays;
            if (remaining > 0) await this.options.vip.removePackage(tx, row.id, remaining);
            await tx
              .update(payments)
              .set({ ...base, status: 'charged_back', chargedBackAt: now, refundedDays: row.days })
              .where(eq(payments.id, row.id));
            await tx
              .update(accounts)
              .set({ purchaseBlockedAt: now, purchaseBlockReason: 'contestação de pagamento' })
              .where(and(eq(accounts.id, row.accountId), isNull(accounts.purchaseBlockedAt)));
            alert = `Contestação do pagamento ${row.id} (Conta ${row.accountId}, ${row.package}). Os dias saíram do VIP e as compras da Conta ficaram bloqueadas até a Staff revisar.`;
            outcome = 'applied';
            vipChanged = true;
          }
          break;
      }
      return { outcome, accountId: row.accountId };
    });
    if (alert) await this.safely(() => this.options.alert?.(alert as string));
    if (vipChanged && result.accountId) {
      await this.safely(() => this.options.onVipChanged?.(result.accountId as string));
    }
    return result;
  }

  // --- Vencimento e conciliação ---------------------------------------------------------------------

  /**
   * A varredura periódica: confere com o provedor o que ficou pendente (webhook perdido), vence o que
   * o QR deixou expirar (consultando antes, porque o pagamento pode ter chegado) e abandona as
   * cobranças que nunca foram criadas no provedor.
   */
  async sweep(now = this.clock()): Promise<{ checked: number; expired: number }> {
    const gateway = this.options.gateway;
    if (gateway === null) return { checked: 0, expired: 0 };
    const abandoned = new Date(now.getTime() - 5 * MINUTE_MS);
    await this.db
      .update(payments)
      .set({
        status: 'cancelled',
        failureReason: 'a cobrança não chegou a ser criada',
        updatedAt: now,
      })
      .where(and(eq(payments.status, 'created'), lt(payments.createdAt, abandoned)));

    const due = await this.db
      .select()
      .from(payments)
      .where(
        and(
          inArray(payments.status, ['pending', 'in_review']),
          or(
            lt(payments.expiresAt, now),
            lt(payments.updatedAt, new Date(now.getTime() - 2 * MINUTE_MS)),
          ),
        ),
      )
      .limit(50);
    let expired = 0;
    for (const row of due) {
      try {
        const outcome = row.providerPaymentId ? await this.sync(row.id, now) : 'ignored';
        const [after] = await this.db.select().from(payments).where(eq(payments.id, row.id));
        void outcome;
        if (
          after &&
          ['pending', 'in_review'].includes(after.status) &&
          after.expiresAt &&
          after.expiresAt <= now
        ) {
          if (row.providerPaymentId)
            await gateway.cancelCharge(row.providerPaymentId).catch(() => undefined);
          await this.db
            .update(payments)
            .set({ status: 'expired', updatedAt: now })
            .where(
              and(eq(payments.id, row.id), inArray(payments.status, ['pending', 'in_review'])),
            );
          expired++;
        }
      } catch {
        // Um pagamento com problema não trava os outros; a próxima varredura tenta de novo.
      }
    }
    return { checked: due.length, expired };
  }

  /**
   * Reconcilia com o provedor: os aprovados dos últimos `days` dias (pega reembolso e contestação sem
   * webhook) e os pendentes. Serve à varredura lenta e ao comando `payments reconcile` (backup restaurado).
   */
  async reconcile(
    options: { since: Date },
    now = this.clock(),
  ): Promise<{ checked: number; changed: number }> {
    const rows = await this.db
      .select()
      .from(payments)
      .where(
        and(
          gt(payments.createdAt, options.since),
          inArray(payments.status, [
            'pending',
            'in_review',
            'approved',
            'partially_refunded',
            'expired',
            'cancelled',
          ]),
        ),
      )
      .orderBy(payments.createdAt)
      .limit(500);
    let changed = 0;
    for (const row of rows) {
      if (!row.providerPaymentId) continue;
      try {
        if ((await this.sync(row.id, now)) === 'applied') changed++;
      } catch {
        // próxima vez
      }
    }
    return { checked: rows.length, changed };
  }

  // --- Internos -------------------------------------------------------------------------------------

  private async own(accountId: string, id: string): Promise<PaymentRow> {
    const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const [row] = valid
      ? await this.db
          .select()
          .from(payments)
          .where(and(eq(payments.id, id), eq(payments.accountId, accountId)))
      : [];
    if (!row) throw new PurchaseRejection('not_found', 'Compra não encontrada');
    return row;
  }

  private async findFor(remote: ProviderPayment): Promise<PaymentRow | null> {
    const [byProvider] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.providerPaymentId, remote.providerPaymentId));
    if (byProvider) return byProvider;
    if (!/^[0-9a-f-]{36}$/i.test(remote.externalReference)) return null;
    const [byReference] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.id, remote.externalReference));
    return byReference ?? null;
  }

  private payerFields(remote: ProviderPayment) {
    const payer = remote.payer;
    if (!payer) return {};
    const key = this.options.dataKey;
    return {
      payerName: payer.name,
      ...(payer.document && key
        ? {
            payerDocumentEncrypted: encryptDocument(key, payer.document),
            payerDocumentLast3: last3Of(payer.document),
          }
        : {}),
    };
  }

  /** O CPF do Pagador em claro: só para uma obrigação legal (recibo completo, ordem judicial). */
  revealDocument(row: Pick<PaymentRow, 'payerDocumentEncrypted'>): string | null {
    const key = this.options.dataKey;
    return row.payerDocumentEncrypted && key
      ? decryptDocument(key, row.payerDocumentEncrypted)
      : null;
  }

  private async hasPermanentBan(tx: Tx | Database, accountId: string): Promise<boolean> {
    const [ban] = await tx
      .select({ id: sanctions.id })
      .from(sanctions)
      .where(
        and(
          eq(sanctions.accountId, accountId),
          eq(sanctions.type, 'ban'),
          isNull(sanctions.endsAt),
          isNull(sanctions.revokedAt),
        ),
      )
      .limit(1);
    return ban !== undefined;
  }

  private async steamIdOf(tx: Tx, accountId: string): Promise<bigint> {
    const [account] = await tx
      .select({ steamId: accounts.steamId })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    return account?.steamId ?? 0n;
  }

  private async logEvent(event: {
    provider: string;
    requestId: string | null;
    topic?: string;
    resourceId?: string;
    signatureValid: boolean;
    paymentId?: string | null;
    outcome: string;
    detail?: string | null;
    now: Date;
  }): Promise<void> {
    await this.db.insert(paymentEvents).values({
      provider: event.provider,
      requestId: event.requestId,
      topic: event.topic ?? null,
      resourceId: event.resourceId ?? null,
      signatureValid: event.signatureValid,
      paymentId: event.paymentId ?? null,
      outcome: event.outcome,
      detail: event.detail ?? null,
      receivedAt: event.now,
    });
  }

  /** Cinco assinaturas inválidas em 10 minutos viram um aviso para a Staff (alguém está tentando). */
  private async noteInvalidSignature(now: Date): Promise<void> {
    const [recent] = await this.db
      .select({ n: count() })
      .from(paymentEvents)
      .where(
        and(
          eq(paymentEvents.signatureValid, false),
          gt(paymentEvents.receivedAt, new Date(now.getTime() - 10 * MINUTE_MS)),
        ),
      );
    if ((recent?.n ?? 0) === 5) {
      await this.safely(() =>
        this.options.alert?.(
          'Webhook de pagamento: 5 chamadas com assinatura inválida em 10 minutos. Confira o segredo do webhook e os logs.',
        ),
      );
    }
  }

  /** Avisos e limpezas de cache nunca derrubam o pagamento. */
  private async safely(fn: () => Promise<unknown> | undefined): Promise<void> {
    try {
      await fn();
    } catch {
      // melhor esforço
    }
  }

  /** Como "Minhas compras" mostra o pagamento. */
  view(row: PaymentRow, now: Date, periodEndsAt: Date | null = null): Purchase {
    const lapsed = row.status === 'pending' && row.expiresAt !== null && row.expiresAt <= now;
    const status = lapsed ? 'expired' : row.status;
    const open = status === 'pending';
    return {
      id: row.id,
      status,
      package: row.package as Purchase['package'],
      days: row.days,
      amountCents: row.amountCents,
      method: row.method,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      refundedCents: row.refundedCents,
      pix:
        open && row.pixCopyPaste
          ? { copyPaste: row.pixCopyPaste, qrCodeBase64: row.pixQrBase64 }
          : null,
      redirectUrl: open ? row.redirectUrl : null,
      simulationUrl:
        open && row.provider === 'fake' && row.providerPaymentId
          ? `${this.options.publicWebUrl}/dev/pagamento/${row.providerPaymentId}`
          : null,
      payerDocumentMasked: maskDocument(row.payerDocumentLast3),
      payerName: row.payerName,
      periodEndsAt: periodEndsAt?.toISOString() ?? null,
      refundableUntil:
        status === 'approved' && row.approvedAt
          ? new Date(row.approvedAt.getTime() + REFUND_WINDOW_DAYS * DAY_MS).toISOString()
          : null,
    };
  }

  /** O fim do Período VIP que cada pagamento gerou. */
  private async periodEnds(ids: string[]): Promise<Map<string, Date>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ paymentId: vipPeriods.paymentId, endsAt: vipPeriods.endsAt })
      .from(vipPeriods)
      .where(inArray(vipPeriods.paymentId, ids));
    return new Map(rows.flatMap((r) => (r.paymentId ? [[r.paymentId, r.endsAt] as const] : [])));
  }

  private async viewOf(row: PaymentRow, now: Date): Promise<Purchase> {
    return this.view(row, now, (await this.periodEnds([row.id])).get(row.id) ?? null);
  }
}
