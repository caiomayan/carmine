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
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DiscordWebhook } from '../src/alerts/discord-webhook.js';
import { SESSION_COOKIE } from '../src/auth/session-cookies.js';
import { payments } from '../src/database/schema.js';
import type { FakePaymentsGateway } from '../src/payments/fake-gateway.js';
import { Payments } from '../src/payments/payments.js';
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
        payerDocumentMasked: '***.***.**9-09',
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

  /**
   * Issue #285 (achados da revisão do PR #284). Estes testes descrevem o comportamento CERTO e
   * falham até a correção: o `refundByStaff` chama o provedor antes de travar a linha, não limita o
   * parcial ao que resta e o gateway de mentira ignora a chave de idempotência.
   */
  describe('reembolso: concorrência, limite e idempotência (#285)', () => {
    const STAFF = { actorSteamId: FOUNDER, reason: 'teste do #285' };
    const row = async (id: string) => {
      const [found] = await t.postgres.db.select().from(payments).where(eq(payments.id, id));
      return found as typeof payments.$inferSelect;
    };

    it('dois reembolsos parciais iguais ao mesmo tempo: o dinheiro sai uma vez, os dias saem uma vez, uma linha de auditoria', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-3m' }); // 2690 / 90 dias
      const service = t.app.get(Payments);
      const providerId = providerIdOf(p);

      await Promise.allSettled([
        service.refundByStaff(p.id, STAFF, { days: 10 }),
        service.refundByStaff(p.id, STAFF, { days: 10 }),
      ]);

      const expectedCents = Math.round((2690 * 10) / 90); // 299
      // O dinheiro: o provedor devolveu uma vez só.
      expect((await gateway.getPayment(providerId))?.refundedCents).toBe(expectedCents);
      // Os dias do Plano e o que o pagamento registra: uma vez só.
      const after = await row(p.id);
      expect(after.refundedDays).toBe(10);
      expect(after.refundedCents).toBe(expectedCents);
      const end = (await vip.statusOf(buyer.account.id)).endsAt as Date;
      expect(Math.abs(end.getTime() - (Date.now() + 80 * DAY_MS))).toBeLessThan(60_000);
      // A auditoria: uma linha só.
      const audit = (await vip.auditOf(buyer.account.id)).filter(
        (a) => a.action === 'payment_refund',
      );
      expect(audit).toHaveLength(1);
    });

    it('vários reembolsos parciais nunca devolvem mais que o valor pago (plano 4990 / 180 dias, de 1 dia em 1 dia)', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-6m' }); // 4990 / 180 dias; 1 dia = 28 centavos
      const service = t.app.get(Payments);
      const spy = vi.spyOn(gateway, 'refund');
      try {
        // 179 × 28 = 5012 > 4990: sem o limite, o 179º pedido passa do que foi pago.
        for (let i = 0; i < 179; i++) {
          if ((await row(p.id)).status === 'refunded') break;
          await service.refundByStaff(p.id, STAFF, { days: 1 });
          expect((await row(p.id)).refundedCents).toBeLessThanOrEqual(4990);
        }
        const asked = spy.mock.calls.reduce((sum, call) => sum + call[1], 0);
        expect(asked).toBeLessThanOrEqual(4990);
        expect((await gateway.getPayment(providerIdOf(p)))?.refundedCents).toBeLessThanOrEqual(
          4990,
        );
      } finally {
        spy.mockRestore();
      }
    }, 120_000);

    it('o gateway de mentira respeita a chave de idempotência: a mesma chave é o mesmo reembolso', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-3m' });
      const providerId = providerIdOf(p);

      await gateway.refund(providerId, 299, 'refund-mesma-chave');
      await gateway.refund(providerId, 299, 'refund-mesma-chave');
      expect((await gateway.getPayment(providerId))?.refundedCents).toBe(299);

      // Outra chave é outro reembolso.
      await gateway.refund(providerId, 100, 'refund-outra-chave');
      expect((await gateway.getPayment(providerId))?.refundedCents).toBe(399);
    });
  });

  /**
   * Issue #291 (achados da revisão adversarial do #289). Escritos por quem NÃO implementa, descrevem o
   * comportamento CERTO e falham até a correção. Cada caso prende o provedor (o falso) de um jeito que a
   * produção só vê raramente: timeout depois do estorno, duplo envio, trava ocupada.
   */
  describe('reembolso pela Staff: retry, duplo envio e travas (#291)', () => {
    const STAFF = { actorSteamId: FOUNDER, reason: 'teste do #291' };
    const row = async (id: string) => {
      const [found] = await t.postgres.db.select().from(payments).where(eq(payments.id, id));
      return found as typeof payments.$inferSelect;
    };
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    const refundCall = (who: Person, id: string, body: object) =>
      who.call('POST', `/api/staff/payments/${id}/refund`, body);
    const providerCents = async (p: Purchase) =>
      (await gateway.getPayment(providerIdOf(p)))?.refundedCents;
    const expectVipEndsIn = async (who: Person, days: number) => {
      const end = (await vip.statusOf(who.account.id)).endsAt as Date;
      expect(Math.abs(end.getTime() - (Date.now() + days * DAY_MS))).toBeLessThan(60_000);
    };
    /** Uma porta que o teste abre quando quiser: prende o `gateway.refund` até lá. */
    const door = () => {
      let open!: () => void;
      const opened = new Promise<void>((resolve) => {
        open = resolve;
      });
      return { opened, open };
    };

    it('retry depois de timeout: o estorno saiu no provedor mas a transação desfez; repetir com a mesma chave não registra centavos a mais', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-3m' }); // 2690 / 90 dias; 10 dias = 299
      const service = t.app.get(Payments);
      const real = gateway.refund.bind(gateway);
      const spy = vi.spyOn(gateway, 'refund');
      try {
        // Tentativa 1: o provedor estorna e o nosso lado perde a resposta (timeout), então a transação desfaz.
        spy.mockImplementationOnce(async (...args) => {
          await real(...args);
          throw new Error('timeout depois do estorno');
        });
        await expect(service.refundByStaff(p.id, STAFF, { days: 10 })).rejects.toBeDefined();
        // O webhook (ou a conciliação) traz o estorno para a linha; os dias do Plano continuam todos.
        await service.reconcile({ since: new Date(Date.now() - DAY_MS) });
        expect(await providerCents(p)).toBe(299);
        expect(await row(p.id)).toMatchObject({ refundedCents: 299, refundedDays: 0 });

        // Tentativa 2: a Staff repete (mesma chave de idempotência, o provedor trata como repetição).
        await service.refundByStaff(p.id, STAFF, { days: 10 });
      } finally {
        spy.mockRestore();
      }

      // O valor guardado é o que o provedor tem (299), nunca 598.
      expect(await providerCents(p)).toBe(299);
      const after = await row(p.id);
      expect(after.refundedCents).toBe(299);
      expect(after.refundedDays).toBe(10);
      expect(after.status).toBe('partially_refunded');
      await expectVipEndsIn(buyer, 80);
    });

    it('duplo envio depois do primeiro commit não vira um segundo reembolso (expectedRefundedDays)', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-3m' });
      // O formulário leu a ficha com 0 dia devolvido e manda isso junto do pedido.
      const body = { reason: 'duplo envio', days: 10, expectedRefundedDays: 0 };

      const first = await refundCall(owner, p.id, body);
      expect(first.statusCode, first.body).toBe(200);
      const second = await refundCall(owner, p.id, body); // o mesmo pedido de novo (clique duplo, retry do cliente)
      expect(second.statusCode, second.body).toBe(409);
      expect(refusal(second)).toBe('payment_not_refundable');

      expect(await providerCents(p)).toBe(299);
      expect(await row(p.id)).toMatchObject({ refundedCents: 299, refundedDays: 10 });
      const audit = (await vip.auditOf(buyer.account.id)).filter(
        (a) => a.action === 'payment_refund',
      );
      expect(audit).toHaveLength(1);
      await expectVipEndsIn(buyer, 80);
    });

    it('lock_timeout na espera da trava vira "reembolso em andamento" (409), não 500', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-3m' });
      const service = t.app.get(Payments);
      const real = gateway.refund.bind(gateway);
      const hold = door();
      let calls = 0;
      const spy = vi.spyOn(gateway, 'refund').mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 1) await hold.opened; // o primeiro reembolso fica preso no provedor, com a trava
        return real(...args);
      });
      try {
        const first = service.refundByStaff(p.id, STAFF, { days: 10 });
        await sleep(500);
        // O segundo pedido espera a trava até o lock_timeout (15 s) e então desiste.
        const second = await refundCall(owner, p.id, { reason: 'espera a trava', days: 10 });
        expect(second.statusCode, second.body).toBe(409);
        expect(staffErrorSchema.parse(second.json()).message).toMatch(/em andamento/i);

        hold.open();
        await first;
      } finally {
        hold.open();
        spy.mockRestore();
      }
      // O primeiro seguiu a vida: o dinheiro saiu uma vez e foi registrado.
      expect(await providerCents(p)).toBe(299);
      expect(await row(p.id)).toMatchObject({ refundedCents: 299, refundedDays: 10 });
    }, 60_000);

    it('o FOR UPDATE depois do provedor não perde o registro: com a linha ocupada além do lock_timeout, espera e grava', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-3m' });
      const service = t.app.get(Payments);
      const real = gateway.refund.bind(gateway);
      const release = door();
      let rowLockHeld: Promise<unknown> = Promise.resolve();
      const spy = vi.spyOn(gateway, 'refund').mockImplementation(async (...args) => {
        await real(...args); // o dinheiro já saiu (e o webhook já passou)...
        // ...e só então outra transação (ex.: um webhook lento) pega a linha e a segura além dos 15 s.
        const taken = door();
        rowLockHeld = t.postgres.db.transaction(async (tx) => {
          await tx.select().from(payments).where(eq(payments.id, p.id)).for('update');
          taken.open();
          await release.opened;
        });
        await taken.opened;
        setTimeout(release.open, 17_000);
      });
      try {
        // Hoje o FOR UPDATE estoura (55P03) com o dinheiro já fora: a transação desfaz e o registro se perde.
        await service.refundByStaff(p.id, STAFF, { days: 10 });
      } finally {
        release.open();
        await rowLockHeld;
        spy.mockRestore();
      }
      expect(await providerCents(p)).toBe(299);
      expect(await row(p.id)).toMatchObject({ refundedCents: 299, refundedDays: 10 });
      await expectVipEndsIn(buyer, 80);
    }, 60_000);

    it('o reembolso do próprio jogador (7 dias) usa a mesma trava: nunca se estorna mais que o pago', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-3m' }); // 2690 / 90 dias
      const service = t.app.get(Payments);
      const real = gateway.refund.bind(gateway);
      const hold = door();
      let calls = 0;
      const spy = vi.spyOn(gateway, 'refund').mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 1) await hold.opened; // o da Staff fica preso no provedor
        return real(...args);
      });
      try {
        const staff = service.refundByStaff(p.id, STAFF, { days: 10 });
        await sleep(300);
        // O jogador pede o reembolso dos 7 dias enquanto o da Staff ainda não terminou.
        const player = buyer.call('POST', `/api/me/purchases/${p.id}/refund`);
        await sleep(300);
        hold.open();
        await staff;
        // Quando chega a vez dele o pagamento já é parcial: o jogador é recusado, não estorna de novo.
        const playerResponse = await player;
        expect(playerResponse.statusCode, playerResponse.body).toBe(409);

        const asked = spy.mock.calls.reduce((sum, call) => sum + call[1], 0);
        expect(asked).toBeLessThanOrEqual(2690);
      } finally {
        hold.open();
        spy.mockRestore();
      }
      // O dinheiro e os dias batem: 299 centavos e 10 dias; o resto do Plano continua.
      expect(await providerCents(p)).toBe(299);
      expect(await row(p.id)).toMatchObject({ refundedCents: 299, refundedDays: 10 });
      await expectVipEndsIn(buyer, 80);
    }, 60_000);
  });

  describe('reembolso pela Staff: revisão do #295', () => {
    it('sem resposta do provedor no total, conta a menos (não 598) e avisa a Staff', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-3m' });
      const service = t.app.get(Payments);
      const staff = { actorSteamId: FOUNDER, reason: 'teste do #295' };
      const real = gateway.refund.bind(gateway);
      const refund = vi.spyOn(gateway, 'refund');
      refund.mockImplementationOnce(async (...args) => {
        await real(...args);
        throw new Error('timeout depois do estorno');
      });
      await expect(service.refundByStaff(p.id, staff, { days: 10 })).rejects.toBeDefined();
      await service.reconcile({ since: new Date(Date.now() - DAY_MS) });
      refund.mockRestore();
      const alert = vi
        .spyOn(DiscordWebhook.prototype, 'send')
        .mockResolvedValue(undefined as never);
      const get = vi.spyOn(gateway, 'getPayment');
      // Só a leitura de dentro do reembolso falha; o sync e o resto seguem.
      get.mockRejectedValueOnce(new Error('provedor fora'));
      try {
        await service.refundByStaff(p.id, staff, { days: 10 });
        const [row] = await t.postgres.db.select().from(payments).where(eq(payments.id, p.id));
        expect(row?.refundedCents).toBe(299);
        expect(row?.refundedDays).toBe(10);
        expect(alert.mock.calls.some(([m]) => String(m).includes('Conciliar'))).toBe(true);
      } finally {
        get.mockRestore();
        alert.mockRestore();
      }
    });

    it('a trava ocupada responde com o código próprio payment_refund_in_progress', async () => {
      const buyer = await member(null);
      const p = await buyAndPay(buyer, { package: 'vip-3m' });
      const service = t.app.get(Payments);
      const real = gateway.refund.bind(gateway);
      let open!: () => void;
      const opened = new Promise<void>((resolve) => {
        open = resolve;
      });
      let calls = 0;
      const spy = vi.spyOn(gateway, 'refund').mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 1) await opened;
        return real(...args);
      });
      try {
        const first = service.refundByStaff(
          p.id,
          { actorSteamId: FOUNDER, reason: 'x' },
          { days: 10 },
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        const second = await owner.call('POST', `/api/staff/payments/${p.id}/refund`, {
          reason: 'espera a trava',
          days: 10,
        });
        expect(second.statusCode, second.body).toBe(409);
        expect(refusal(second)).toBe('payment_refund_in_progress');
        open();
        await first;
      } finally {
        open();
        spy.mockRestore();
      }
    }, 60_000);
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
