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
  staffRefundAmount,
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

describe('staffRefundAmount (a regra única do reembolso da Staff)', () => {
  // Os preços reais dos Pacotes (VIP_PACKAGES): 30 d R$ 9,90, 90 d R$ 26,90, 180 d R$ 49,90.
  const pack = (days: number, amountCents: number) => ({
    days,
    amountCents,
    refundedCents: 0,
    refundedDays: 0,
  });

  it('sem dias devolve tudo o que resta, em centavos exatos', () => {
    expect(staffRefundAmount(pack(90, 2690))).toEqual({ days: 90, cents: 2690 });
  });

  it('parcial: valor × dias ÷ dias do Pacote, arredondado ao centavo mais próximo (R$ 2,99, não 2,98)', () => {
    expect(staffRefundAmount(pack(90, 2690), 10)).toEqual({ days: 10, cents: 299 });
    expect(staffRefundAmount(pack(30, 990), 10)).toEqual({ days: 10, cents: 330 });
    expect(staffRefundAmount(pack(180, 4990), 7)).toEqual({ days: 7, cents: 194 });
  });

  it('pedir os dias que restam devolve o resto todo, sem sobra de arredondamento', () => {
    // 10 d já devolvidos (R$ 2,99): os 80 d que restam valem os R$ 23,91 que sobram.
    const partial = { days: 90, amountCents: 2690, refundedCents: 299, refundedDays: 10 };
    expect(staffRefundAmount(partial, 80)).toEqual({ days: 80, cents: 2391 });
    expect(staffRefundAmount(partial)).toEqual({ days: 80, cents: 2391 });
  });

  it('os dias nunca passam do que resta', () => {
    const partial = { days: 90, amountCents: 2690, refundedCents: 299, refundedDays: 10 };
    expect(staffRefundAmount(partial, 500)).toEqual({ days: 80, cents: 2391 });
  });

  it('o parcial nunca passa do que resta em centavos (plano 4990 / 180 d: 1 dia arredonda para 28)', () => {
    // 178 × 28 = 4984; o 179º dia valeria 28, mas só restam 6.
    const nearEnd = { days: 180, amountCents: 4990, refundedCents: 4984, refundedDays: 178 };
    expect(staffRefundAmount(nearEnd, 1)).toEqual({ days: 1, cents: 6 });
    const all = { days: 180, amountCents: 4990, refundedCents: 4990, refundedDays: 179 };
    expect(staffRefundAmount(all, 1)).toEqual({ days: 1, cents: 0 });
  });
});
