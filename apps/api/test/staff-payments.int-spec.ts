import { randomBytes } from 'node:crypto';
import {
  CSRF_HEADER,
  type Purchase,
  purchaseSchema,
  type StaffRole,
  staffCompensationOverviewSchema,
  staffCompensationResultSchema,
  staffErrorSchema,
  staffPaymentDetailSchema,
  staffPaymentPageSchema,
  staffPurchasesUnblockedSchema,
  staffReconcileResultSchema,
} from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/session-cookies.js';
import type { FakePaymentsGateway } from '../src/payments/fake-gateway.js';
import { PAYMENTS_GATEWAY } from '../src/payments/payments.module.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { VipPeriods } from '../src/vip/vip-periods.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const FOUNDER = steamIdFor(9999);

/**
 * O painel da Staff nos pagamentos (S14): a lista com filtro e a contagem por estado, a ficha com os
 * webhooks, reembolsar (total e por dias), reabrir as compras depois de uma contestação, conciliar e a
 * compensação em lote. Só o Dono e o Admin; o provedor é o falso, com o webhook assinado de verdade.
 */
describe('Pagamentos no painel da Staff (S14)', () => {
  let t: TestApp;
  let gateway: FakePaymentsGateway;
  let vip: VipPeriods;
  let next = 1;
  let owner: Awaited<ReturnType<typeof member>>;
  let admin: Awaited<ReturnType<typeof member>>;
  let moderator: Awaited<ReturnType<typeof member>>;

  beforeAll(async () => {
    t = await startTestApp({
      PAYMENTS_ENABLED: 'true',
      PAYMENTS_PROVIDER: 'fake',
      PAYMENTS_DATA_KEY: randomBytes(32).toString('base64'),
      PAYMENTS_SWEEP_SECONDS: '0',
    });
    gateway = t.app.get(PAYMENTS_GATEWAY) as FakePaymentsGateway;
    vip = t.app.get(VipPeriods);
    owner = await member('owner');
    admin = await member('admin');
    moderator = await member('moderator');
  });

  afterAll(async () => {
    await t?.stop();
  });

  async function member(role: StaffRole | null, options: { vipUntil?: number } = {}) {
    const player = await signedInPlayer(t, next++, options);
    if (role) {
      await t.app
        .get(StaffRoles)
        .set(player.account.id, role, { actorSteamId: FOUNDER, reason: 'teste' });
    }
    return player;
  }

  type Person = Awaited<ReturnType<typeof member>>;

  const buy = async (who: Person, over: { package?: string; method?: string } = {}) => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/me/purchases',
      headers: {
        cookie: `${SESSION_COOKIE}=${who.session.id}`,
        [CSRF_HEADER]: who.session.csrfToken,
      },
      payload: {
        package: over.package ?? 'vip-1m',
        method: over.method ?? 'pix',
        adultDeclaration: true,
        declarationVersion: '2026-10-27',
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return purchaseSchema.parse(response.json());
  };

  const providerIdOf = (p: Purchase) => (p.simulationUrl as string).split('/').pop() as string;

  const buyAndPay = async (who: Person, over: { package?: string } = {}) => {
    const p = await buy(who, over);
    await gateway.act(providerIdOf(p), 'pay');
    return p;
  };

  const sheet = async (by: Person, id: string) => {
    const response = await by.call('GET', `/api/staff/payments/${id}`);
    expect(response.statusCode, response.body).toBe(200);
    return staffPaymentDetailSchema.parse(response.json());
  };

  const refusal = (response: { statusCode: number; json: () => unknown }) => {
    const error = staffErrorSchema.parse(response.json());
    expect(response.statusCode).toBe(error.statusCode);
    return error.code;
  };

  describe('quem pode', () => {
    it('Dono e Admin leem os pagamentos; Moderador, jogador e visitante, não', async () => {
      const player = await member(null);

      expect((await owner.call('GET', '/api/staff/payments')).statusCode).toBe(200);
      expect((await admin.call('GET', '/api/staff/payments')).statusCode).toBe(200);
      expect((await moderator.call('GET', '/api/staff/payments')).statusCode).toBe(403);
      expect((await player.call('GET', '/api/staff/payments')).statusCode).toBe(403);
      expect((await t.app.inject({ url: '/api/staff/payments' })).statusCode).toBe(401);
    });

    it('as ações também são só do Dono e do Admin', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer);
      const bodies: [string, string, object][] = [
        ['POST', `/api/staff/payments/${p.id}/refund`, { reason: 'teste do papel' }],
        ['POST', '/api/staff/payments/reconcile', {}],
        [
          'POST',
          '/api/staff/payments/compensation',
          { days: 1, key: 'sem-papel', reason: 'teste do papel' },
        ],
        [
          'POST',
          `/api/staff/accounts/${buyer.account.publicId}/purchases/unblock`,
          { reason: 'teste do papel' },
        ],
      ];

      for (const [method, url, body] of bodies) {
        const response = await moderator.call(method as 'POST', url, body);
        expect([method, url, response.statusCode]).toEqual([method, url, 403]);
      }
      expect((await moderator.call('GET', '/api/staff/payments/compensation')).statusCode).toBe(
        403,
      );
    });
  });

  describe('a lista', () => {
    it('filtra por estado, conta cada estado e pagina pelo cursor', async () => {
      const a = await member(null);
      const b = await member(null);
      const c = await member(null);
      const pending = await buy(a);
      const paid = await buyAndPay(b);
      const expired = await buy(c);
      await gateway.act(providerIdOf(expired), 'expire');

      const everything = staffPaymentPageSchema.parse(
        (await owner.call('GET', '/api/staff/payments?limit=100')).json(),
      );
      const ids = everything.payments.map((row) => row.id);
      expect(ids).toEqual(expect.arrayContaining([pending.id, paid.id, expired.id]));
      // Do mais recente ao mais antigo.
      expect(ids.indexOf(expired.id)).toBeLessThan(ids.indexOf(pending.id));
      expect(everything.counts.approved).toBeGreaterThanOrEqual(1);
      expect(everything.counts.pending).toBeGreaterThanOrEqual(1);

      const approved = staffPaymentPageSchema.parse(
        (await owner.call('GET', '/api/staff/payments?status=approved&limit=100')).json(),
      );
      expect(approved.payments.every((row) => row.status === 'approved')).toBe(true);
      expect(approved.payments.map((row) => row.id)).toContain(paid.id);
      expect(approved.payments.map((row) => row.id)).not.toContain(pending.id);
      // A contagem é do total, não da página.
      expect(approved.counts).toEqual(everything.counts);

      const first = staffPaymentPageSchema.parse(
        (await owner.call('GET', '/api/staff/payments?limit=1')).json(),
      );
      expect(first.payments).toHaveLength(1);
      expect(first.nextCursor).not.toBeNull();
      const second = staffPaymentPageSchema.parse(
        (
          await owner.call(
            'GET',
            `/api/staff/payments?limit=1&before=${encodeURIComponent(first.nextCursor as string)}`,
          )
        ).json(),
      );
      expect(second.payments[0]?.id).not.toBe(first.payments[0]?.id);
    });

    it('cada linha leva a Conta, o Pagador mascarado e nunca o CPF inteiro', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer);

      const page = staffPaymentPageSchema.parse(
        (await owner.call('GET', '/api/staff/payments?status=approved&limit=100')).json(),
      );

      const row = page.payments.find((r) => r.id === p.id);
      expect(row).toMatchObject({
        package: 'vip-1m',
        amountCents: 990,
        provider: 'fake',
        account: { publicId: buyer.account.publicId, purchasesBlocked: false },
        payerName: 'Pagador de Mentira',
        payerDocumentMasked: '***.***.909-**',
      });
      expect(JSON.stringify(page)).not.toContain('12345678909');
    });

    it('estado ou cursor inválidos respondem 400 com o código do painel', async () => {
      expect(refusal(await owner.call('GET', '/api/staff/payments?status=talvez'))).toBe(
        'invalid_body',
      );
      expect(refusal(await owner.call('GET', '/api/staff/payments?before=abc'))).toBe(
        'invalid_body',
      );
    });
  });

  describe('a ficha', () => {
    it('traz o provedor, os valores, o que dá para devolver e os webhooks recebidos', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer);

      const detail = await sheet(admin, p.id);

      expect(detail.payment).toMatchObject({ id: p.id, status: 'approved', amountCents: 990 });
      expect(detail.providerPaymentId).toBe(providerIdOf(p));
      expect(detail.refundable).toEqual({ days: 30, cents: 990 });
      expect(detail.vipEndsAt).not.toBeNull();
      expect(detail.purchaseBlock).toBeNull();
      expect(detail.declarationVersion).toBe('2026-10-27');
      // O webhook de aprovação foi aceito: assinatura válida e aplicado.
      expect(detail.events.some((e) => e.signatureValid && e.outcome === 'applied')).toBe(true);
      expect(detail.audit).toEqual([]);
    });

    it('um pagamento que ainda não foi pago não tem o que devolver', async () => {
      const buyer = await member(null);
      const p = await buy(buyer);

      expect((await sheet(owner, p.id)).refundable).toBeNull();
    });

    it('um id que não existe responde 404; um que não é UUID, 400', async () => {
      expect(
        refusal(
          await owner.call('GET', '/api/staff/payments/0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102'),
        ),
      ).toBe('payment_not_found');
      expect((await owner.call('GET', '/api/staff/payments/xxx')).statusCode).toBe(400);
    });
  });

  describe('reembolsar', () => {
    it('devolve tudo: o provedor estorna, os dias saem do VIP e a ação fica na ficha, com o motivo', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer);
      expect((await vip.statusOf(buyer.account.id)).active).toBe(true);

      const response = await owner.call('POST', `/api/staff/payments/${p.id}/refund`, {
        reason: 'pedido depois dos 7 dias, queda de 3 dias',
      });

      expect(response.statusCode, response.body).toBe(200);
      const detail = staffPaymentDetailSchema.parse(response.json());
      expect(detail.payment).toMatchObject({ status: 'refunded', refundedCents: 990 });
      expect(detail.refundedDays).toBe(30);
      expect(detail.refundable).toBeNull();
      expect((await vip.statusOf(buyer.account.id)).active).toBe(false);
      expect(detail.audit[0]).toMatchObject({
        action: 'payment_refund',
        reason: 'pedido depois dos 7 dias, queda de 3 dias',
        actorSteamId: owner.steamId,
      });
    });

    it('por dias: devolve parte e continua com o resto para devolver', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-3m' });

      const response = await admin.call('POST', `/api/staff/payments/${p.id}/refund`, {
        reason: 'indisponibilidade de 10 dias',
        days: 10,
      });

      const detail = staffPaymentDetailSchema.parse(response.json());
      expect(detail.payment.status).toBe('partially_refunded');
      expect(detail.refundedDays).toBe(10);
      expect(detail.refundable?.days).toBe(80);
      expect(detail.payment.refundedCents).toBe(Math.round((2690 * 10) / 90));
    });

    it('recusa o que não dá: pagamento sem aprovação, já devolvido, motivo curto ou id desconhecido', async () => {
      const buyer = await member(null);
      const pending = await buy(buyer);
      expect(
        refusal(
          await owner.call('POST', `/api/staff/payments/${pending.id}/refund`, {
            reason: 'ainda pendente',
          }),
        ),
      ).toBe('payment_not_refundable');

      const paid = await buyAndPay(await member(null));
      await owner.call('POST', `/api/staff/payments/${paid.id}/refund`, { reason: 'primeira vez' });
      expect(
        refusal(
          await owner.call('POST', `/api/staff/payments/${paid.id}/refund`, {
            reason: 'segunda vez',
          }),
        ),
      ).toBe('payment_not_refundable');

      expect(
        (await owner.call('POST', `/api/staff/payments/${paid.id}/refund`, { reason: 'ab' }))
          .statusCode,
      ).toBe(400);
      expect(
        refusal(
          await owner.call(
            'POST',
            '/api/staff/payments/0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102/refund',
            { reason: 'não existe' },
          ),
        ),
      ).toBe('payment_not_found');
    });
  });

  describe('contestação e reabrir as compras', () => {
    it('a contestação bloqueia a Conta; a Staff reabre depois de revisar, uma vez só', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer);
      await gateway.act(providerIdOf(p), 'chargeback');

      const blocked = await sheet(owner, p.id);
      expect(blocked.payment.status).toBe('charged_back');
      expect(blocked.payment.account.purchasesBlocked).toBe(true);
      expect(blocked.purchaseBlock).not.toBeNull();

      const response = await owner.call(
        'POST',
        `/api/staff/accounts/${buyer.account.publicId}/purchases/unblock`,
        { reason: 'contestação revisada: o pagamento era legítimo' },
      );
      expect(response.statusCode, response.body).toBe(200);
      expect(staffPurchasesUnblockedSchema.parse(response.json())).toEqual({
        publicId: buyer.account.publicId,
      });
      const reopened = await sheet(owner, p.id);
      expect(reopened.purchaseBlock).toBeNull();
      // Reabrir é da Conta: a ficha de cada pagamento dela mostra a ação, com o motivo.
      expect(reopened.audit[0]).toMatchObject({
        action: 'purchase_unblock',
        reason: 'contestação revisada: o pagamento era legítimo',
      });

      expect(
        refusal(
          await owner.call(
            'POST',
            `/api/staff/accounts/${buyer.account.publicId}/purchases/unblock`,
            { reason: 'de novo' },
          ),
        ),
      ).toBe('purchases_not_blocked');
    });

    it('uma Conta que não existe responde 404', async () => {
      expect(
        refusal(
          await owner.call('POST', '/api/staff/accounts/9999999/purchases/unblock', {
            reason: 'não existe',
          }),
        ),
      ).toBe('account_not_found');
    });
  });

  describe('conciliar', () => {
    it('confere os pagamentos recentes com o provedor e diz quantos foram conferidos e quantos mudaram', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer);

      const response = await owner.call('POST', '/api/staff/payments/reconcile', { days: 8 });

      expect(response.statusCode, response.body).toBe(200);
      const result = staffReconcileResultSchema.parse(response.json());
      expect(result.checked).toBeGreaterThanOrEqual(1);
      // Nada mudou no provedor desde o webhook: a conciliação confirma o estado, sem desfazer nada.
      expect((await sheet(owner, p.id)).payment.status).toBe('approved');
    });

    it('os dias vão de 1 a 400 (8 por padrão)', async () => {
      expect((await owner.call('POST', '/api/staff/payments/reconcile', {})).statusCode).toBe(200);
      expect(
        (await owner.call('POST', '/api/staff/payments/reconcile', { days: 0 })).statusCode,
      ).toBe(400);
      expect(
        (await owner.call('POST', '/api/staff/payments/reconcile', { days: 401 })).statusCode,
      ).toBe(400);
    });
  });

  describe('compensar por indisponibilidade (D4)', () => {
    it('mostra os VIPs ativos antes, soma os dias a todos de uma vez e registra', async () => {
      const first = await member(null, { vipUntil: Date.now() + 10 * DAY_MS });
      const second = await member(null, { vipUntil: Date.now() + 20 * DAY_MS });
      const noVip = await member(null);
      const before = staffCompensationOverviewSchema.parse(
        (await owner.call('GET', '/api/staff/payments/compensation')).json(),
      );
      expect(before.activeVips).toBeGreaterThanOrEqual(2);
      const endBefore = (await vip.statusOf(first.account.id)).endsAt?.getTime() ?? 0;

      const response = await owner.call('POST', '/api/staff/payments/compensation', {
        days: 2,
        key: 'queda-teste-1',
        reason: 'Servidores fora por 30 horas',
      });

      expect(response.statusCode, response.body).toBe(200);
      const result = staffCompensationResultSchema.parse(response.json());
      expect(result).toEqual({ accounts: before.activeVips, days: 2 });
      const endAfter = (await vip.statusOf(first.account.id)).endsAt?.getTime() ?? 0;
      expect(Math.abs(endAfter - (endBefore + 2 * DAY_MS))).toBeLessThan(1000);
      expect((await vip.statusOf(second.account.id)).active).toBe(true);
      expect((await vip.statusOf(noVip.account.id)).active).toBe(false);

      const after = staffCompensationOverviewSchema.parse(
        (await owner.call('GET', '/api/staff/payments/compensation')).json(),
      );
      expect(after.recent[0]).toMatchObject({
        key: 'queda-teste-1',
        days: 2,
        accounts: result.accounts,
        reason: 'Servidores fora por 30 horas',
        actorSteamId: owner.steamId,
      });
    });

    it('a mesma chave não soma duas vezes', async () => {
      await member(null, { vipUntil: Date.now() + 5 * DAY_MS });
      const body = { days: 1, key: 'queda-teste-2', reason: 'queda curta' };
      expect((await owner.call('POST', '/api/staff/payments/compensation', body)).statusCode).toBe(
        200,
      );

      expect(refusal(await owner.call('POST', '/api/staff/payments/compensation', body))).toBe(
        'compensation_applied',
      );
    });

    it('recusa dias fora de 1 a 30, chave com espaço e motivo curto', async () => {
      const ok = { days: 1, key: 'queda-teste-3', reason: 'queda curta' };
      for (const body of [
        { ...ok, days: 0 },
        { ...ok, days: 31 },
        { ...ok, key: 'com espaço' },
        { ...ok, reason: 'ab' },
      ]) {
        expect(
          (await owner.call('POST', '/api/staff/payments/compensation', body)).statusCode,
        ).toBe(400);
      }
    });
  });
});
