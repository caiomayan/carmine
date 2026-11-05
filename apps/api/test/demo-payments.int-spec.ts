import { randomBytes } from 'node:crypto';
import { count, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountsService } from '../src/accounts/accounts.service.js';
import { Catalog } from '../src/catalog/catalog.js';
import { DATABASE } from '../src/database/database.module.js';
import { accounts, payments } from '../src/database/schema.js';
import { DEMO_PLAYERS } from '../src/demo/demo-cast.js';
import { DEMO_PAYMENT_SCENARIOS } from '../src/demo/demo-payments.js';
import { type SeedServices, seedDemo } from '../src/demo/demo-seed.js';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { Inventory } from '../src/inventory/inventory.js';
import { Loadouts } from '../src/loadout/loadouts.js';
import { FAKE_PAYER } from '../src/payments/fake-gateway.js';
import { Payments } from '../src/payments/payments.js';
import { PAYMENTS_GATEWAY } from '../src/payments/payments.module.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { VipPeriods } from '../src/vip/vip-periods.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

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

  beforeAll(async () => {
    t = await startTestApp({
      PAYMENTS_ENABLED: 'true',
      PAYMENTS_PROVIDER: 'fake',
      PAYMENTS_DATA_KEY: randomBytes(32).toString('base64'),
      PAYMENTS_SWEEP_SECONDS: '0',
    });
    services = {
      db: t.app.get(DATABASE),
      accounts: t.app.get(AccountsService),
      inventory: t.app.get(Inventory),
      loadouts: t.app.get(Loadouts),
      vip: t.app.get(VipPeriods),
      staffRoles: t.app.get(StaffRoles),
      catalog: t.app.get(Catalog),
      payments: { payments: t.app.get(Payments), gateway: t.app.get(PAYMENTS_GATEWAY) },
    };
    await t.app.get(GameServerRegistry).retire({ name: 'retake-teste' });
  });

  afterAll(async () => {
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

  it('semeia aprovado, reembolsado parcialmente e contestado, e não repete', async () => {
    await seedDemo(services, settings, new Date(), () => {});
    await seedDemo(services, settings, new Date(), () => {});

    const rows = await demoPayments();
    expect(rows).toHaveLength(3);
    const byKey = new Map(rows.map((row) => [row.idempotencyKey, row]));

    const approved = byKey.get('demo-pagamento-aprovado');
    expect(approved?.status).toBe('approved');
    expect(approved?.provider).toBe('fake');

    const partial = byKey.get('demo-pagamento-reembolso-parcial');
    expect(partial?.status).toBe('partially_refunded');
    expect(partial?.refundedDays).toBe(30);
    expect(partial?.refundedCents).toBeGreaterThan(0);
    expect(partial?.refundedCents).toBeLessThan(partial?.amountCents ?? 0);

    const charged = byKey.get('demo-pagamento-contestado');
    expect(charged?.status).toBe('charged_back');
    const [blocked] = await services.db
      .select({ at: accounts.purchaseBlockedAt })
      .from(accounts)
      .where(eq(accounts.id, charged?.accountId as string));
    expect(blocked?.at).not.toBeNull();
  });

  it('guarda o CPF só de teste, cifrado, e uma Conta por pagamento', async () => {
    const rows = await demoPayments();
    expect(new Set(rows.map((row) => row.accountId)).size).toBe(3);
    for (const row of rows) {
      expect(row.payerName).toBe(FAKE_PAYER.name);
      expect(row.payerDocumentLast3).toBe(FAKE_PAYER.document.slice(-3));
      expect(row.payerDocumentEncrypted).not.toBeNull();
      expect(row.payerDocumentEncrypted).not.toContain(FAKE_PAYER.document);
      expect(t.app.get(Payments).revealDocument(row)).toBe(FAKE_PAYER.document);
    }
    // Nenhum pagamento da demonstração cai na Conta do dono nem fora das Contas fictícias.
    const demoSteamIds = new Set(DEMO_PLAYERS.map((player) => BigInt(player.steamId)));
    const owners = await services.db
      .select({ steamId: accounts.steamId })
      .from(accounts)
      .where(
        inArray(
          accounts.id,
          rows.map((row) => row.accountId),
        ),
      );
    for (const owner of owners) expect(demoSteamIds.has(owner.steamId)).toBe(true);
  });

  it('retoma o que ficou no meio do caminho, sem criar outro pagamento', async () => {
    const [before] = await services.db.select({ n: count() }).from(payments);
    await services.db
      .update(payments)
      .set({ status: 'pending' })
      .where(eq(payments.idempotencyKey, 'demo-pagamento-aprovado'));
    // O falso já guarda esta cobrança como paga: a conciliação do webhook leva de volta a aprovado.
    await seedDemo(services, settings, new Date(), () => {});
    const [after] = await services.db.select({ n: count() }).from(payments);
    expect(after?.n).toBe(before?.n);
    const [row] = await services.db
      .select({ status: payments.status })
      .from(payments)
      .where(eq(payments.idempotencyKey, 'demo-pagamento-aprovado'));
    expect(row?.status).toBe('approved');
  });

  it('sem o dono não semeia pagamento (o reembolso precisa de um autor da Staff)', async () => {
    const lines: string[] = [];
    const before = await demoPayments();
    await seedDemo(services, { ...settings, ownerSteamId: null }, new Date(), (l) => lines.push(l));
    expect(await demoPayments()).toHaveLength(before.length);
    expect(lines.some((l) => l.includes('sem DEMO_OWNER_STEAM_ID'))).toBe(true);
  });
});
