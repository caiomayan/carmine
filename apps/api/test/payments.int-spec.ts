import { randomBytes } from 'node:crypto';
import {
  CSRF_HEADER,
  type Cs2Item,
  inventorySchema,
  type Purchase,
  purchaseErrorSchema,
  purchaseListSchema,
  purchaseSchema,
  vipPackagesSchema,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/session-cookies.js';
import { paymentEvents, payments, vipHeldItems, vipPeriods } from '../src/database/schema.js';
import { Sanctions } from '../src/moderation/sanctions.js';
import type { FakePaymentsGateway } from '../src/payments/fake-gateway.js';
import { Payments } from '../src/payments/payments.js';
import { PAYMENTS_GATEWAY } from '../src/payments/payments.module.js';
import { signatureHeader } from '../src/payments/webhook-signature.js';
import { CompensationAlreadyApplied, VipCompensation } from '../src/vip/vip-compensation.js';
import { VipHold } from '../src/vip/vip-hold.js';
import { VipPeriods } from '../src/vip/vip-periods.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const STAFF = { actorSteamId: steamIdFor(9999), reason: 'teste' };
const AK_STATTRAK: Cs2Item = { id: 222, wear: 0.15, seed: 661, statTrak: 0 };
const AGENT = 8620;

describe('Pacotes VIP e pagamentos (S14), com o provedor falso', () => {
  let t: TestApp;
  let next = 1;
  let payments_: Payments;
  let gateway: FakePaymentsGateway;
  let hold: VipHold;
  let vip: VipPeriods;
  const db = () => t.postgres.db;

  beforeAll(async () => {
    t = await startTestApp({
      PAYMENTS_ENABLED: 'true',
      PAYMENTS_PROVIDER: 'fake',
      PAYMENTS_DATA_KEY: randomBytes(32).toString('base64'),
      PAYMENTS_SWEEP_SECONDS: '0',
      VIP_HOLD_ENABLED: 'true',
      VIP_HOLD_SWEEP_SECONDS: '0',
    });
    payments_ = t.app.get(Payments);
    gateway = t.app.get(PAYMENTS_GATEWAY) as FakePaymentsGateway;
    hold = t.app.get(VipHold);
    vip = t.app.get(VipPeriods);
  });

  afterAll(async () => {
    await t?.stop();
  });

  const player = (options: { vipUntil?: number } = {}) => signedInPlayer(t, next++, options);
  type Player = Awaited<ReturnType<typeof player>>;

  const purchase = async (
    who: Player,
    over: { package?: string; method?: string; key?: string } = {},
  ) => {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/me/purchases',
      headers: {
        cookie: `${SESSION_COOKIE}=${who.session.id}`,
        [CSRF_HEADER]: who.session.csrfToken,
        ...(over.key && { 'idempotency-key': over.key }),
      },
      payload: {
        package: over.package ?? 'vip-1m',
        method: over.method ?? 'pix',
        adultDeclaration: true,
        declarationVersion: '2026-10-27',
      },
    });
    return response;
  };

  const created = async (who: Player, over: Parameters<typeof purchase>[1] = {}) => {
    const response = await purchase(who, over);
    expect(response.statusCode, response.body).toBe(201);
    return purchaseSchema.parse(response.json());
  };

  const providerIdOf = (p: Purchase) => (p.simulationUrl as string).split('/').pop() as string;

  const fetchPurchase = async (who: Player, id: string) =>
    purchaseSchema.parse((await who.call('GET', `/api/me/purchases/${id}`)).json());

  /** Compra e "paga" no falso: o webhook assinado aprova e concede o VIP. */
  const buyAndPay = async (who: Player, over: Parameters<typeof purchase>[1] = {}) => {
    const p = await created(who, over);
    await gateway.act(providerIdOf(p), 'pay');
    return fetchPurchase(who, p.id);
  };

  const vipEnd = async (who: Player) => (await vip.statusOf(who.account.id)).endsAt;
  const roughly = (date: Date | null, days: number) => {
    expect(date).not.toBeNull();
    expect(Math.abs((date as Date).getTime() - (Date.now() + days * DAY_MS))).toBeLessThan(60_000);
  };

  describe('o catálogo e a compra', () => {
    it('lista os Pacotes e diz que a compra está aberta e é de mentira', async () => {
      const body = vipPackagesSchema.parse(
        (await t.app.inject({ url: '/api/vip/packages' })).json(),
      );

      expect(body).toMatchObject({ enabled: true, sandbox: true });
      expect(body.packages.map((p) => [p.id, p.priceCents])).toEqual([
        ['vip-1m', 990],
        ['vip-3m', 2690],
        ['vip-6m', 4990],
      ]);
    });

    it('exige sessão', async () => {
      expect((await t.app.inject({ method: 'POST', url: '/api/me/purchases' })).statusCode).toBe(
        401,
      );
      expect((await t.app.inject({ url: '/api/me/purchases' })).statusCode).toBe(401);
    });

    it('cria uma compra Pix pendente com o QR e a página de simulação', async () => {
      const who = await player();
      const p = await created(who);

      expect(p).toMatchObject({
        status: 'pending',
        package: 'vip-1m',
        days: 30,
        amountCents: 990,
        method: 'pix',
      });
      expect(p.pix?.copyPaste).toContain('FAKE');
      expect(p.simulationUrl).toMatch(/\/dev\/pagamento\/[0-9a-f]{16}$/);
      expect(p.redirectUrl).toBeNull();
      const list = purchaseListSchema.parse((await who.call('GET', '/api/me/purchases')).json());
      expect(list.purchases.map((x) => x.id)).toEqual([p.id]);
    });

    it('o cartão devolve o endereço do checkout, sem Pix', async () => {
      const who = await player();
      const p = await created(who, { method: 'card' });

      expect(p.pix).toBeNull();
      expect(p.redirectUrl).toContain('/dev/pagamento/');
    });

    it('recusa Pacote desconhecido e a declaração de maioridade ausente', async () => {
      const who = await player();
      const bad = await purchase(who, { package: 'vip-9m' });
      expect(bad.statusCode).toBe(400);
      expect(purchaseErrorSchema.parse(bad.json()).code).toBe('invalid_body');
      const noDeclaration = await t.app.inject({
        method: 'POST',
        url: '/api/me/purchases',
        headers: {
          cookie: `${SESSION_COOKIE}=${who.session.id}`,
          [CSRF_HEADER]: who.session.csrfToken,
        },
        payload: {
          package: 'vip-1m',
          method: 'pix',
          adultDeclaration: false,
          declarationVersion: 'x',
        },
      });
      expect(noDeclaration.statusCode).toBe(400);
    });

    it('a mesma Idempotency-Key, ou o mesmo Pacote pendente, devolvem a mesma compra', async () => {
      const who = await player();
      const first = await created(who, { key: 'duplo-clique' });
      const second = await created(who, { key: 'duplo-clique' });
      const third = await created(who);

      expect(second.id).toBe(first.id);
      expect(third.id).toBe(first.id);
      const rows = await db().select().from(payments).where(eq(payments.accountId, who.account.id));
      expect(rows).toHaveLength(1);
    });

    it('trocar de Pacote cancela o pendente anterior, inclusive no provedor', async () => {
      const who = await player();
      const first = await created(who);
      const second = await created(who, { package: 'vip-3m' });

      expect(second.id).not.toBe(first.id);
      expect((await fetchPurchase(who, first.id)).status).toBe('cancelled');
      expect((await gateway.getPayment(providerIdOf(first)))?.status).toBe('cancelled');
    });

    it('a compra de outra Conta não existe', async () => {
      const owner = await player();
      const other = await player();
      const p = await created(owner);

      expect((await other.call('GET', `/api/me/purchases/${p.id}`)).statusCode).toBe(404);
      expect((await other.call('GET', '/api/me/purchases/nao-e-uuid')).statusCode).toBe(404);
    });
  });

  describe('o pagamento e o webhook', () => {
    it('pago: o webhook aprova, o VIP começa na hora e o recibo mostra só o fim do CPF', async () => {
      const who = await player();

      const paid = await buyAndPay(who);

      expect(paid.status).toBe('approved');
      expect(paid.approvedAt).not.toBeNull();
      expect(paid.payerDocumentMasked).toBe('***.***.909-**');
      expect(paid.payerName).toBe('Pagador de Mentira');
      // O recibo diz até quando o VIP vai por causa desta compra, e até quando dá para pedir reembolso.
      expect(Date.parse(paid.periodEndsAt as string)).toBe((await vipEnd(who))?.getTime());
      expect(
        Date.parse(paid.refundableUntil as string) - Date.parse(paid.approvedAt as string),
      ).toBe(7 * DAY_MS);
      roughly(await vipEnd(who), 30);
      const [row] = await db().select().from(payments).where(eq(payments.id, paid.id));
      expect(row?.payerDocumentEncrypted?.startsWith('v1.')).toBe(true);
      expect(row?.payerDocumentEncrypted).not.toContain('12345678909');
      expect(row?.payerName).toBe('Pagador de Mentira');
    });

    it('o mesmo webhook entregue de novo concede o VIP uma vez só', async () => {
      const who = await player();
      const paid = await buyAndPay(who);
      const providerId = (await db().select().from(payments).where(eq(payments.id, paid.id)))[0]
        ?.providerPaymentId as string;

      await gateway.notify(providerId);
      await gateway.notify(providerId);
      await payments_.sync(paid.id);

      const periods = await db().select().from(vipPeriods).where(eq(vipPeriods.paymentId, paid.id));
      expect(periods).toHaveLength(1);
      roughly(await vipEnd(who), 30);
      const events = await db()
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.paymentId, paid.id));
      expect(events.map((e) => e.outcome).sort()).toEqual(['applied', 'unchanged', 'unchanged']);
    });

    it('webhook com assinatura inválida é recusado (401) e registrado, sem consultar nada', async () => {
      const who = await player();
      const p = await created(who);
      const providerId = providerIdOf(p);
      const send = (headers: Record<string, string>, id = providerId) =>
        t.app.inject({
          method: 'POST',
          url: `/api/webhooks/mercadopago?data.id=${id}&type=payment`,
          headers,
          payload: { type: 'payment', data: { id } },
        });

      expect((await send({})).statusCode).toBe(401);
      expect(
        (
          await send({
            'x-request-id': 'r',
            'x-signature': `ts=${Date.now()},v1=${'0'.repeat(64)}`,
          })
        ).statusCode,
      ).toBe(401);
      // Assinatura válida de OUTRO recurso não vale para este.
      const other = signatureHeader(
        'carmine-provedor-falso-nao-e-segredo',
        { dataId: 'outro', requestId: 'r' },
        Date.now(),
      );
      expect((await send({ 'x-request-id': 'r', 'x-signature': other })).statusCode).toBe(401);

      expect((await fetchPurchase(who, p.id)).status).toBe('pending');
      const invalid = (await db().select().from(paymentEvents)).filter((e) => !e.signatureValid);
      expect(invalid.length).toBeGreaterThanOrEqual(3);
      expect(invalid.every((e) => e.outcome === 'invalid_signature')).toBe(true);
    });

    it('webhook assinado de um pagamento que não conhecemos é aceito e ignorado', async () => {
      const id = 'desconhecido0001';
      const response = await t.app.inject({
        method: 'POST',
        url: `/api/webhooks/mercadopago?data.id=${id}&type=payment`,
        headers: {
          'x-request-id': 'r1',
          'x-signature': signatureHeader(
            'carmine-provedor-falso-nao-e-segredo',
            { dataId: id, requestId: 'r1' },
            Date.now(),
          ),
        },
        payload: { type: 'payment', data: { id } },
      });

      expect(response.statusCode).toBe(200);
      const ignored = await db()
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.resourceId, id));
      expect(ignored[0]).toMatchObject({ outcome: 'ignored', signatureValid: true });
    });

    it('o webhook não concede nada pelo corpo: valor diferente do Pacote não aprova', async () => {
      const who = await player();
      const p = await created(who);
      await db().update(payments).set({ amountCents: 1 }).where(eq(payments.id, p.id));

      await gateway.act(providerIdOf(p), 'pay');

      expect((await fetchPurchase(who, p.id)).status).toBe('pending');
      expect(await vipEnd(who)).toBeNull();
      const events = await db()
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.paymentId, p.id));
      expect(events.at(-1)?.outcome).toBe('mismatch');
    });

    it('recusado e expirado no provedor viram recusado e expirado, sem VIP', async () => {
      const who = await player();
      const first = await created(who);
      await gateway.act(providerIdOf(first), 'reject');
      expect((await fetchPurchase(who, first.id)).status).toBe('rejected');

      const second = await created(who);
      await gateway.act(providerIdOf(second), 'expire');
      const expired = await fetchPurchase(who, second.id);
      expect(expired.status).toBe('expired');
      expect(expired.pix).toBeNull();
      expect(await vipEnd(who)).toBeNull();
    });

    it('comprar 3 meses com 10 dias de VIP resulta em 100 dias', async () => {
      const who = await player({ vipUntil: Date.now() + 10 * DAY_MS });

      await buyAndPay(who, { package: 'vip-3m' });

      roughly(await vipEnd(who), 100);
    });

    it('o pagamento que chega depois de o QR vencer ainda concede o VIP (o dinheiro entrou)', async () => {
      const who = await player();
      const p = await created(who);
      await db().update(payments).set({ status: 'expired' }).where(eq(payments.id, p.id));

      await gateway.act(providerIdOf(p), 'pay');

      expect((await fetchPurchase(who, p.id)).status).toBe('approved');
      roughly(await vipEnd(who), 30);
    });

    it('a rota de simulação do falso muda o estado e dispara o webhook', async () => {
      const who = await player();
      const p = await created(who);
      const id = providerIdOf(p);

      const shown = await t.app.inject({ url: `/api/dev/payments/${id}` });
      expect(shown.json()).toMatchObject({ status: 'pending', externalReference: p.id });
      const paid = await t.app.inject({ method: 'POST', url: `/api/dev/payments/${id}/pay` });
      expect(paid.json()).toMatchObject({ status: 'approved' });
      expect(
        (await t.app.inject({ method: 'POST', url: `/api/dev/payments/${id}/explodir` }))
          .statusCode,
      ).toBe(404);
      expect((await fetchPurchase(who, p.id)).status).toBe('approved');
    });
  });

  describe('vencimento e conciliação', () => {
    it('o webhook perdido é achado pela varredura', async () => {
      const who = await player();
      const p = await created(who);
      // Sem entrega: o pagamento acontece no provedor e a API não é avisada.
      gateway.attach(async () => {});
      await gateway.act(providerIdOf(p), 'pay');
      gateway.attach(async (request) => {
        await payments_.handleWebhook(request);
      });
      expect((await db().select().from(payments).where(eq(payments.id, p.id)))[0]?.status).toBe(
        'pending',
      );

      await db()
        .update(payments)
        .set({ updatedAt: new Date(Date.now() - 5 * 60_000) })
        .where(eq(payments.id, p.id));
      await payments_.sweep();

      expect((await fetchPurchase(who, p.id)).status).toBe('approved');
      roughly(await vipEnd(who), 30);
    });

    it('o QR vencido vira expirado e é cancelado no provedor; o pendente novo não é tocado', async () => {
      const who = await player();
      const old = await created(who);
      await db()
        .update(payments)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(payments.id, old.id));
      const other = await player();
      const fresh = await created(other);

      const { expired } = await payments_.sweep();

      expect(expired).toBeGreaterThanOrEqual(1);
      expect((await db().select().from(payments).where(eq(payments.id, old.id)))[0]?.status).toBe(
        'expired',
      );
      expect((await fetchPurchase(other, fresh.id)).status).toBe('pending');
      expect((await gateway.getPayment(providerIdOf(old)))?.status).toBe('cancelled');
    });

    it('a cobrança que nunca chegou ao provedor é abandonada', async () => {
      const who = await player();
      const [row] = await db()
        .insert(payments)
        .values({
          accountId: who.account.id,
          package: 'vip-1m',
          days: 30,
          amountCents: 990,
          method: 'pix',
          provider: 'fake',
          adultDeclaredAt: new Date(),
          declarationVersion: 'x',
          idempotencyKey: 'abandonada',
          createdAt: new Date(Date.now() - 10 * 60_000),
        })
        .returning();

      await payments_.sweep();

      expect(
        (
          await db()
            .select()
            .from(payments)
            .where(eq(payments.id, row?.id as string))
        )[0],
      ).toMatchObject({
        status: 'cancelled',
      });
    });
  });

  describe('reembolso, contestação e as travas', () => {
    it('reembolso de 7 dias pelo site: devolve tudo e os dias saem do VIP', async () => {
      const who = await player();
      const paid = await buyAndPay(who);

      const response = await who.call('POST', `/api/me/purchases/${paid.id}/refund`);

      expect(response.statusCode, response.body).toBe(200);
      expect(purchaseSchema.parse(response.json())).toMatchObject({
        status: 'refunded',
        refundedCents: 990,
      });
      expect((await vip.statusOf(who.account.id)).active).toBe(false);
      // Reembolsar de novo não faz nada.
      expect((await who.call('POST', `/api/me/purchases/${paid.id}/refund`)).statusCode).toBe(409);
    });

    it('com dois Pacotes, reembolsar um recua só os dias dele', async () => {
      const who = await player();
      const first = await buyAndPay(who);
      await buyAndPay(who);
      roughly(await vipEnd(who), 60);

      await who.call('POST', `/api/me/purchases/${first.id}/refund`);

      roughly(await vipEnd(who), 30);
      expect((await vip.statusOf(who.account.id)).active).toBe(true);
    });

    it('depois dos 7 dias o site não reembolsa (409) e a pendente não tem reembolso', async () => {
      const who = await player();
      const paid = await buyAndPay(who);
      await db()
        .update(payments)
        .set({ approvedAt: new Date(Date.now() - 8 * DAY_MS) })
        .where(eq(payments.id, paid.id));
      const pending = await created(await player());

      const late = await who.call('POST', `/api/me/purchases/${paid.id}/refund`);
      expect(late.statusCode).toBe(409);
      expect(purchaseErrorSchema.parse(late.json()).code).toBe('refund_unavailable');
      expect(pending.status).toBe('pending');
      roughly(await vipEnd(who), 30);
    });

    it('a Staff reembolsa depois dos 7 dias, e parcialmente por dias, com auditoria', async () => {
      const who = await player();
      const paid = await buyAndPay(who);
      await db()
        .update(payments)
        .set({ approvedAt: new Date(Date.now() - 20 * DAY_MS) })
        .where(eq(payments.id, paid.id));

      const partial = await payments_.refundByStaff(paid.id, STAFF, { days: 10 });

      expect(partial).toMatchObject({ status: 'partially_refunded', refundedCents: 330 });
      roughly(await vipEnd(who), 20);
      const rest = await payments_.refundByStaff(paid.id, STAFF);
      expect(rest.status).toBe('refunded');
      expect(rest.refundedCents).toBe(990);
      expect((await vip.statusOf(who.account.id)).active).toBe(false);
      const audit = await vip.auditOf(who.account.id);
      expect(audit.filter((a) => a.action === 'payment_refund')).toHaveLength(2);
    });

    it('contestação: tira os dias, bloqueia novas compras e a Staff reabre', async () => {
      const who = await player();
      const paid = await buyAndPay(who);

      await gateway.act(
        (await db().select().from(payments).where(eq(payments.id, paid.id)))[0]
          ?.providerPaymentId as string,
        'chargeback',
      );

      expect((await fetchPurchase(who, paid.id)).status).toBe('charged_back');
      expect((await vip.statusOf(who.account.id)).active).toBe(false);
      const blocked = await purchase(who);
      expect(blocked.statusCode).toBe(403);
      expect(purchaseErrorSchema.parse(blocked.json()).code).toBe('purchases_blocked');

      expect(await payments_.unblockPurchases(who.account.id, STAFF)).toBe(true);
      expect(await payments_.unblockPurchases(who.account.id, STAFF)).toBe(false);
      expect((await purchase(who)).statusCode).toBe(201);
    });

    it('ban permanente não compra VIP', async () => {
      const who = await player();
      await t.app.get(Sanctions).apply(who.account.id, STAFF, {
        category: 'cheat',
        measures: [{ type: 'ban', durationMinutes: null }],
        witness: 'teste',
      });

      const response = await purchase(who);

      // Pelo site, a Conta banida já não faz mutações (403 do guard); o serviço também recusa.
      expect(response.statusCode).toBe(403);
      await expect(
        payments_.create(
          who.account.id,
          { package: 'vip-1m', method: 'pix', adultDeclaration: true, declarationVersion: 'x' },
          null,
        ),
      ).rejects.toMatchObject({ code: 'banned' });
    });

    it('o VIP não passa de 2 anos à frente e há limite de compras por dia', async () => {
      const far = await player({ vipUntil: Date.now() + 700 * DAY_MS });
      const horizon = await purchase(far, { package: 'vip-6m' });
      expect(horizon.statusCode).toBe(422);
      expect(purchaseErrorSchema.parse(horizon.json()).code).toBe('vip_horizon');

      const busy = await player();
      for (let n = 0; n < 10; n++) {
        await db()
          .insert(payments)
          .values({
            accountId: busy.account.id,
            package: 'vip-1m',
            days: 30,
            amountCents: 990,
            method: 'pix',
            status: 'rejected',
            provider: 'fake',
            adultDeclaredAt: new Date(),
            declarationVersion: 'x',
            idempotencyKey: `k${n}`,
          });
      }
      const limit = await purchase(busy);
      expect(limit.statusCode).toBe(429);
      expect(purchaseErrorSchema.parse(limit.json()).code).toBe('daily_limit');
    });

    it('um pagamento em análise (cartão) impede outra compra', async () => {
      const who = await player();
      const p = await created(who, { method: 'card' });
      await db().update(payments).set({ status: 'in_review' }).where(eq(payments.id, p.id));

      const again = await purchase(who);

      expect(again.statusCode).toBe(409);
      expect(purchaseErrorSchema.parse(again.json()).code).toBe('purchase_in_progress');
    });
  });

  describe('os Itens VIP guardados por 30 dias (D3)', () => {
    const inventoryOf = async (who: Player) =>
      inventorySchema.parse((await who.call('GET', '/api/inventory')).json()).items;

    it('sem VIP o agente e o StatTrak saem; com VIP voltam inteiros, nos mesmos slots', async () => {
      const who = await player({ vipUntil: Date.now() + 10 * DAY_MS });
      const ak = await who.add(AK_STATTRAK);
      const agent = await who.add({ id: AGENT });
      await who.equip(ak);
      await who.equip(agent);

      await vip.revoke(who.account.id, STAFF);
      expect(await hold.syncAccount(who.account.id)).toBe('held');

      const items = await inventoryOf(who);
      expect(items.map((i) => i.uid)).toEqual([ak]);
      expect(items[0]?.item.statTrak).toBeUndefined();
      const loadout = (await who.call('GET', '/api/loadout')).json();
      expect(loadout.entries.filter((e: { uid: string | null }) => e.uid === agent)).toHaveLength(
        0,
      );
      expect(
        await db().select().from(vipHeldItems).where(eq(vipHeldItems.accountId, who.account.id)),
      ).toHaveLength(2);

      await vip.grant(who.account.id, 30);
      expect(await hold.syncAccount(who.account.id)).toBe('restored');

      const back = await inventoryOf(who);
      expect(back.map((i) => i.uid).sort()).toEqual([ak, agent].sort());
      expect(back.find((i) => i.uid === ak)?.item.statTrak).toBe(0);
      const restored = (await who.call('GET', '/api/loadout')).json();
      expect(
        restored.entries.filter((e: { uid: string | null }) => e.uid === agent).length,
      ).toBeGreaterThan(0);
      expect(
        await db().select().from(vipHeldItems).where(eq(vipHeldItems.accountId, who.account.id)),
      ).toHaveLength(0);
    });

    it('passados 30 dias sem VIP, o guardado é apagado para sempre', async () => {
      const who = await player({ vipUntil: Date.now() + DAY_MS });
      await who.add({ id: AGENT });
      await vip.revoke(who.account.id, STAFF);
      await hold.syncAccount(who.account.id);
      await db()
        .update(vipHeldItems)
        .set({ heldAt: new Date(Date.now() - 31 * DAY_MS) })
        .where(eq(vipHeldItems.accountId, who.account.id));

      expect(await hold.purge()).toBeGreaterThanOrEqual(1);
      await vip.grant(who.account.id, 30);
      await hold.syncAccount(who.account.id);

      expect(await inventoryOf(who)).toHaveLength(0);
    });

    it('a varredura acha sozinha quem perdeu o VIP e quem o recuperou', async () => {
      const lost = await player({ vipUntil: Date.now() + DAY_MS });
      await lost.add({ id: AGENT });
      // O VIP acabou sem ninguém chamar nada: só o tempo passou.
      await db()
        .update(vipPeriods)
        .set({
          startsAt: new Date(Date.now() - 40 * DAY_MS),
          endsAt: new Date(Date.now() - 10 * DAY_MS),
        })
        .where(eq(vipPeriods.accountId, lost.account.id));

      const first = await hold.sweep();
      expect(first.held).toBeGreaterThanOrEqual(1);
      expect(await inventoryOf(lost)).toHaveLength(0);

      await vip.grant(lost.account.id, 5);
      const second = await hold.sweep();
      expect(second.restored).toBeGreaterThanOrEqual(1);
      expect(await inventoryOf(lost)).toHaveLength(1);
    });

    it('comprar o VIP devolve os Itens guardados na hora', async () => {
      const who = await player({ vipUntil: Date.now() + DAY_MS });
      await who.add({ id: AGENT });
      await vip.revoke(who.account.id, STAFF);
      await hold.syncAccount(who.account.id);
      expect(await inventoryOf(who)).toHaveLength(0);

      await buyAndPay(who);

      expect(await inventoryOf(who)).toHaveLength(1);
    });
  });

  describe('compensação por indisponibilidade (D4)', () => {
    it('soma os dias a todos os VIPs ativos, uma vez por chave', async () => {
      const a = await player({ vipUntil: Date.now() + 5 * DAY_MS });
      const b = await player({ vipUntil: Date.now() + 20 * DAY_MS });
      const free = await player();
      const compensation = t.app.get(VipCompensation);

      const result = await compensation.run({ days: 2, key: 'queda-2026-10-27' }, STAFF);

      expect(result.accounts).toBeGreaterThanOrEqual(2);
      roughly(await vipEnd(a), 7);
      roughly(await vipEnd(b), 22);
      expect(await vipEnd(free)).toBeNull();
      await expect(compensation.run({ days: 2, key: 'queda-2026-10-27' }, STAFF)).rejects.toThrow(
        CompensationAlreadyApplied,
      );
      roughly(await vipEnd(a), 7);
    });
  });

  it('o ban permanente de qualquer categoria é "permanentBan" (J2: o painel encerra o VIP)', async () => {
    const who = await player();
    const applied = await t.app.get(Sanctions).apply(who.account.id, STAFF, {
      category: 'offensive_chat',
      measures: [{ type: 'ban', durationMinutes: null }],
    });

    expect(applied.permanentBan).toBe(true);
  });
});
