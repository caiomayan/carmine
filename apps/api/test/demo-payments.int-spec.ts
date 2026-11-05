import { randomBytes } from 'node:crypto';
import { ADULT_DECLARATION_VERSION } from '@carmine/contracts';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AccountsService } from '../src/accounts/accounts.service.js';
import { DiscordWebhook } from '../src/alerts/discord-webhook.js';
import { Catalog } from '../src/catalog/catalog.js';
import { APP_CONFIG, type AppConfig } from '../src/config/config.js';
import { DATABASE } from '../src/database/database.module.js';
import { accounts, payments } from '../src/database/schema.js';
import { DEMO_PLAYERS } from '../src/demo/demo-cast.js';
import { createSeedPayments, DEMO_PAYMENT_SCENARIOS } from '../src/demo/demo-payments.js';
import { type SeedServices, seedDemo } from '../src/demo/demo-seed.js';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { Inventory } from '../src/inventory/inventory.js';
import { Loadouts } from '../src/loadout/loadouts.js';
import { FAKE_PAYER, type FakePaymentsGateway } from '../src/payments/fake-gateway.js';
import { Payments } from '../src/payments/payments.js';
import { PAYMENTS_GATEWAY } from '../src/payments/payments.module.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { VipHold } from '../src/vip/vip-hold.js';
import { VipPeriods } from '../src/vip/vip-periods.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

const DAY_MS = 86_400_000;
const OWNER = steamIdFor(4244);
const settings = {
  secret: 'segredo-da-homologacao-'.padEnd(48, 'x'),
  ownerSteamId: OWNER,
  publicWebUrl: 'https://dev.stcarmine.com',
};

/** Os pagamentos de demonstração (#292): o que o QA de aceite da #231 precisa ver na homologação. */
describe('Pagamentos na demonstração da homologação (#292)', () => {
  let t: TestApp;
  let services: SeedServices;
  let gateway: FakePaymentsGateway;
  let alertSend: ReturnType<typeof vi.spyOn>;
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);

  beforeAll(async () => {
    t = await startTestApp({
      PAYMENTS_ENABLED: 'true',
      PAYMENTS_PROVIDER: 'fake',
      PAYMENTS_DATA_KEY: randomBytes(32).toString('base64'),
      PAYMENTS_SWEEP_SECONDS: '0',
    });
    gateway = t.app.get(PAYMENTS_GATEWAY) as FakePaymentsGateway;
    const config = t.app.get<AppConfig>(APP_CONFIG);
    const appPayments = t.app.get(Payments);
    services = {
      db: t.app.get(DATABASE),
      accounts: t.app.get(AccountsService),
      inventory: t.app.get(Inventory),
      loadouts: t.app.get(Loadouts),
      vip: t.app.get(VipPeriods),
      staffRoles: t.app.get(StaffRoles),
      catalog: t.app.get(Catalog),
      // Como o runner do seed: o Payments do seed é SEM alerta e o do app volta a ser o tratador no fim.
      payments: {
        payments: createSeedPayments({
          db: t.app.get(DATABASE),
          gateway,
          vip: t.app.get(VipPeriods),
          enabled: config.payments.enabled,
          dataKey: config.payments.dataKey,
          publicWebUrl: config.publicWebUrl,
          onVipChanged: (accountId) => t.app.get(VipHold).syncAccount(accountId),
        }),
        gateway,
        restoreSink: async (request) => {
          await appPayments.handleWebhook(request);
        },
      },
    };
    alertSend = vi.spyOn(DiscordWebhook.prototype, 'send');
    await t.app.get(GameServerRegistry).retire({ name: 'retake-teste' });
  });

  afterAll(async () => {
    alertSend?.mockRestore();
    await t?.stop();
  });

  async function demoPayments() {
    return services.db
      .select()
      .from(payments)
      .where(
        inArray(
          payments.idempotencyKey,
          DEMO_PAYMENT_SCENARIOS.map((s) => s.key),
        ),
      );
  }

  const byKey = async (key: string) => (await demoPayments()).find((r) => r.idempotencyKey === key);

  /** A Conta do comprador de um cenário (o seed a cria no connect; aqui se antecipa para deixar o pagamento a meio). */
  async function buyerAccount(key: string): Promise<string> {
    const scenario = DEMO_PAYMENT_SCENARIOS.find((s) => s.key === key);
    const player = DEMO_PLAYERS.find((p) => p.name === scenario?.buyer);
    if (!scenario || !player) throw new Error('cenário desconhecido');
    const { accountId } = await services.accounts.registerConnect({
      steamId: player.steamId,
      steamName: player.name,
    });
    return accountId;
  }

  async function startPurchase(key: string, pkg: 'vip-1m' | 'vip-3m') {
    return t.app.get(Payments).create(
      await buyerAccount(key),
      {
        package: pkg,
        method: 'pix',
        adultDeclaration: true,
        declarationVersion: ADULT_DECLARATION_VERSION,
      },
      key,
    );
  }

  it('termina o que ficou no meio do caminho e semeia o resto, sem duplicar', async () => {
    // Um deploy que parou no meio: o aprovado ficou pendente (criado, não pago) e o parcial ficou pago, sem reembolso.
    const first = await startPurchase('demo-pagamento-aprovado', 'vip-1m');
    expect(first.status).toBe('pending');
    const second = await startPurchase('demo-pagamento-reembolso-parcial', 'vip-3m');
    const [secondRow] = await services.db.select().from(payments).where(eq(payments.id, second.id));
    await gateway.act(secondRow?.providerPaymentId as string, 'pay');
    expect((await byKey('demo-pagamento-reembolso-parcial'))?.status).toBe('approved');

    await seedDemo(services, settings, new Date(), log);
    await seedDemo(services, settings, new Date(), log);

    expect(await demoPayments()).toHaveLength(3);
    expect((await byKey('demo-pagamento-aprovado'))?.status).toBe('approved');
    const partial = await byKey('demo-pagamento-reembolso-parcial');
    expect(partial?.status).toBe('partially_refunded');
    expect(partial?.refundedDays).toBe(30);
    expect(partial?.refundedCents).toBeGreaterThan(0);
    expect(partial?.refundedCents).toBeLessThan(partial?.amountCents ?? 0);
    const charged = await byKey('demo-pagamento-contestado');
    expect(charged?.status).toBe('charged_back');
    const [blocked] = await services.db
      .select({ at: accounts.purchaseBlockedAt })
      .from(accounts)
      .where(eq(accounts.id, charged?.accountId as string));
    expect(blocked?.at).not.toBeNull();
  });

  it('não manda alerta ao Discord, nem na contestação nem no estorno', () => {
    expect(alertSend).not.toHaveBeenCalled();
  });

  it('os dias do Plano: o aprovado tem 30, o parcial deixa 60 e a contestação tira tudo', async () => {
    const vip = t.app.get(VipPeriods);
    const now = new Date();
    const days = async (key: string) => {
      const row = await byKey(key);
      const status = await vip.statusOf(row?.accountId as string, now);
      return {
        active: status.active,
        left: ((status.endsAt?.getTime() ?? 0) - now.getTime()) / DAY_MS,
      };
    };
    const approved = await days('demo-pagamento-aprovado');
    expect(approved.active).toBe(true);
    expect(approved.left).toBeGreaterThan(29);
    expect(approved.left).toBeLessThanOrEqual(30);
    const partial = await days('demo-pagamento-reembolso-parcial');
    expect(partial.active).toBe(true);
    expect(partial.left).toBeGreaterThan(59);
    expect(partial.left).toBeLessThanOrEqual(60);
    expect((await days('demo-pagamento-contestado')).active).toBe(false);
  });

  it('guarda o CPF só de teste, cifrado, e mostra só o mascarado na visão da API', async () => {
    const rows = await demoPayments();
    expect(new Set(rows.map((row) => row.accountId)).size).toBe(3);
    const service = t.app.get(Payments);
    for (const row of rows) {
      expect(row.payerName).toBe(FAKE_PAYER.name);
      expect(row.payerDocumentLast3).toBe(FAKE_PAYER.document.slice(-3));
      expect(row.payerDocumentEncrypted).not.toBeNull();
      expect(row.payerDocumentEncrypted).not.toContain(FAKE_PAYER.document);
      expect(service.revealDocument(row)).toBe(FAKE_PAYER.document);
      const view = await service.get(row.accountId, row.id);
      expect(view.payerDocumentMasked).toBe('***.***.909-**');
      expect(JSON.stringify(view)).not.toContain(FAKE_PAYER.document);
    }
  });

  it('um pagamento em estado fora do roteiro fica como está, com aviso no log', async () => {
    lines.length = 0;
    await services.db
      .update(payments)
      .set({ status: 'expired' })
      .where(eq(payments.idempotencyKey, 'demo-pagamento-aprovado'));
    await seedDemo(services, settings, new Date(), log);
    expect((await byKey('demo-pagamento-aprovado'))?.status).toBe('expired');
    expect(
      lines.some((l) => l.includes('demo-pagamento-aprovado') && l.includes('"expired"')),
    ).toBe(true);
    expect(await demoPayments()).toHaveLength(3);
    await services.db
      .update(payments)
      .set({ status: 'approved' })
      .where(eq(payments.idempotencyKey, 'demo-pagamento-aprovado'));
  });

  it('sem o dono não semeia pagamento (o reembolso precisa de um autor da Staff)', async () => {
    lines.length = 0;
    const before = await demoPayments();
    await seedDemo(services, { ...settings, ownerSteamId: null }, new Date(), log);
    expect(await demoPayments()).toHaveLength(before.length);
    expect(lines.some((l) => l.includes('sem DEMO_OWNER_STEAM_ID'))).toBe(true);
  });
});
