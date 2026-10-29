import { describe, expect, it } from 'vitest';
import {
  createPurchaseSchema,
  PAYMENT_STATUSES,
  paymentStatusSchema,
  purchaseSchema,
  VIP_PACKAGE_MONTH_DAYS,
  VIP_PACKAGES,
  vipPackageIdSchema,
} from './payments.js';

const UUID = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';

describe('Pacotes VIP', () => {
  it('cada Pacote é um número inteiro de meses de 30 dias, e o schema do ID cobre todos', () => {
    for (const pkg of VIP_PACKAGES) {
      expect(pkg.days).toBe(pkg.months * VIP_PACKAGE_MONTH_DAYS);
      expect(vipPackageIdSchema.safeParse(pkg.id).success).toBe(true);
    }
    expect(vipPackageIdSchema.safeParse('vip-12m').success).toBe(false);
  });

  it('quanto mais meses, mais barato o mês', () => {
    const perMonth = VIP_PACKAGES.map((p) => p.priceCents / p.months);
    expect(perMonth).toEqual([...perMonth].sort((a, b) => b - a));
  });
});

describe('createPurchaseSchema', () => {
  const body = {
    package: 'vip-1m',
    method: 'pix',
    adultDeclaration: true,
    declarationVersion: 'v1',
  };

  it('aceita a compra com a declaração de maioridade', () => {
    expect(createPurchaseSchema.safeParse(body).success).toBe(true);
    expect(createPurchaseSchema.safeParse({ ...body, method: 'card' }).success).toBe(true);
  });

  it('recusa sem a declaração, com Pacote ou meio desconhecidos', () => {
    expect(createPurchaseSchema.safeParse({ ...body, adultDeclaration: false }).success).toBe(
      false,
    );
    const { adultDeclaration: _omitted, ...without } = body;
    expect(createPurchaseSchema.safeParse(without).success).toBe(false);
    expect(createPurchaseSchema.safeParse({ ...body, package: 'vip-2m' }).success).toBe(false);
    expect(createPurchaseSchema.safeParse({ ...body, method: 'boleto' }).success).toBe(false);
  });
});

describe('purchaseSchema', () => {
  it('uma compra pendente com Pix, e uma aprovada com o CPF mascarado', () => {
    const base = {
      id: UUID,
      package: 'vip-3m',
      days: 90,
      amountCents: 2690,
      method: 'pix',
      createdAt: '2026-10-27T18:00:00-03:00',
      expiresAt: '2026-10-27T18:30:00-03:00',
      approvedAt: null,
      refundedCents: 0,
      redirectUrl: null,
      simulationUrl: null,
      payerDocumentMasked: null,
      payerName: null,
      periodEndsAt: null,
      refundableUntil: null,
    };
    expect(
      purchaseSchema.safeParse({
        ...base,
        status: 'pending',
        pix: { copyPaste: '0002...', qrCodeBase64: null },
      }).success,
    ).toBe(true);
    expect(
      purchaseSchema.safeParse({
        ...base,
        status: 'approved',
        approvedAt: '2026-10-27T18:01:00-03:00',
        pix: null,
        payerDocumentMasked: '***.***.**9-09',
      }).success,
    ).toBe(true);
  });

  it('os estados são os dez da proposta', () => {
    expect(PAYMENT_STATUSES).toHaveLength(10);
    expect(paymentStatusSchema.safeParse('charged_back').success).toBe(true);
    expect(paymentStatusSchema.safeParse('paid').success).toBe(false);
  });
});
