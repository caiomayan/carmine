import { describe, expect, it } from 'vitest';
import { PAYMENT_STATUSES } from './payments.js';
import { STAFF_ERROR_CODES, STAFF_ERROR_STATUS, STAFF_PERMISSIONS, staffCan } from './staff.js';
import {
  COMPENSATION_MAX_DAYS,
  staffCompensationInputSchema,
  staffCompensationOverviewSchema,
  staffPaymentDetailSchema,
  staffPaymentFilterSchema,
  staffPaymentPageSchema,
  staffPaymentRefundSchema,
  staffReconcileInputSchema,
} from './staff-payments.js';

const ID = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';
const AT = '2026-10-27T12:00:00.000Z';

const summary = {
  id: ID,
  status: 'approved',
  package: 'vip-1m',
  days: 30,
  amountCents: 990,
  refundedCents: 0,
  method: 'pix',
  provider: 'fake',
  createdAt: AT,
  approvedAt: AT,
  account: { publicId: 10_016, displayName: 'coldzera', purchasesBlocked: false },
  payerName: 'Pagador de Mentira',
  payerDocumentMasked: '***.***.909-**',
};

describe('permissão dos pagamentos', () => {
  it('só o Dono e o Admin gerenciam pagamentos', () => {
    expect(STAFF_PERMISSIONS['payments.manage']).toEqual(['owner', 'admin']);
    expect(staffCan('owner', 'payments.manage')).toBe(true);
    expect(staffCan('admin', 'payments.manage')).toBe(true);
    expect(staffCan('moderator', 'payments.manage')).toBe(false);
    expect(staffCan(null, 'payments.manage')).toBe(false);
  });

  it('os erros novos têm o seu HTTP', () => {
    for (const code of [
      'payment_not_found',
      'payment_not_refundable',
      'payment_provider_unavailable',
      'purchases_not_blocked',
      'compensation_applied',
    ] as const) {
      expect(STAFF_ERROR_CODES).toContain(code);
      expect(STAFF_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
    expect(STAFF_ERROR_STATUS.payment_provider_unavailable).toBe(502);
  });
});

describe('a lista', () => {
  it('o filtro aceita "all" e qualquer estado do pagamento, e nada mais', () => {
    for (const status of ['all', ...PAYMENT_STATUSES]) {
      expect(staffPaymentFilterSchema.safeParse(status).success).toBe(true);
    }
    expect(staffPaymentFilterSchema.safeParse('talvez').success).toBe(false);
  });

  it('a página leva as linhas, o cursor e a contagem por estado', () => {
    const page = {
      payments: [summary],
      nextCursor: null,
      counts: { approved: 3, pending: 1 },
    };

    expect(staffPaymentPageSchema.parse(page).counts.approved).toBe(3);
    expect(staffPaymentPageSchema.safeParse({ ...page, counts: { sumido: 1 } }).success).toBe(
      false,
    );
  });
});

describe('a ficha', () => {
  const detail = {
    payment: summary,
    providerPaymentId: 'fake-123',
    expiresAt: null,
    refundedDays: 0,
    refundedAt: null,
    chargedBackAt: null,
    adultDeclaredAt: AT,
    declarationVersion: '2026-10-27',
    failureReason: null,
    updatedAt: AT,
    vipEndsAt: AT,
    purchaseBlock: null,
    refundable: { days: 30, cents: 990 },
    events: [
      {
        id: ID,
        receivedAt: AT,
        topic: 'payment',
        requestId: 'req-1',
        signatureValid: true,
        outcome: 'applied',
        detail: null,
      },
    ],
    audit: [],
  };

  it('aceita a ficha de um pagamento aprovado e a de um que não cabe reembolso', () => {
    expect(staffPaymentDetailSchema.parse(detail).events).toHaveLength(1);
    expect(staffPaymentDetailSchema.parse({ ...detail, refundable: null }).refundable).toBeNull();
  });
});

describe('as ações', () => {
  it('o reembolso precisa do motivo; os dias são opcionais e de 1 a 3650', () => {
    expect(staffPaymentRefundSchema.safeParse({ reason: 'queda de 3 dias' }).success).toBe(true);
    expect(staffPaymentRefundSchema.safeParse({ reason: 'ok?', days: 10 }).success).toBe(true);
    expect(staffPaymentRefundSchema.safeParse({ reason: 'ab' }).success).toBe(false);
    expect(staffPaymentRefundSchema.safeParse({ reason: 'queda', days: 0 }).success).toBe(false);
    expect(staffPaymentRefundSchema.safeParse({ reason: 'queda', extra: 1 }).success).toBe(false);
  });

  it('conciliar olha 8 dias por padrão e no máximo 400', () => {
    expect(staffReconcileInputSchema.parse({}).days).toBe(8);
    expect(staffReconcileInputSchema.safeParse({ days: 401 }).success).toBe(false);
  });

  it('a compensação exige dias (até 30), uma chave sem espaço e o motivo', () => {
    const ok = { days: 2, key: 'queda-2026-10-27', reason: 'servidores fora por 30 horas' };

    expect(staffCompensationInputSchema.parse(ok).key).toBe('queda-2026-10-27');
    expect(staffCompensationInputSchema.safeParse({ ...ok, days: 0 }).success).toBe(false);
    expect(
      staffCompensationInputSchema.safeParse({ ...ok, days: COMPENSATION_MAX_DAYS + 1 }).success,
    ).toBe(false);
    expect(staffCompensationInputSchema.safeParse({ ...ok, key: 'com espaço' }).success).toBe(
      false,
    );
    expect(staffCompensationInputSchema.safeParse({ ...ok, key: 'ab' }).success).toBe(false);
  });

  it('o resumo da compensação traz os VIPs ativos e as últimas aplicadas', () => {
    const overview = {
      activeVips: 12,
      recent: [
        {
          key: 'queda-1',
          days: 2,
          accounts: 10,
          reason: 'queda',
          createdAt: AT,
          actorName: 'Dono',
          actorSteamId: '76561198000000001',
        },
      ],
    };

    expect(staffCompensationOverviewSchema.parse(overview).activeVips).toBe(12);
  });
});
