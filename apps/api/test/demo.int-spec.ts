import {
  eventBatchResultSchema,
  liveServerListSchema,
  rankingSchema,
  serverHeartbeatResultSchema,
} from '@carmine/contracts';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountsService } from '../src/accounts/accounts.service.js';
import { Catalog } from '../src/catalog/catalog.js';
import { DATABASE } from '../src/database/database.module.js';
import {
  accountStatsWeekly,
  accounts,
  inventoryItems,
  staffMembers,
} from '../src/database/schema.js';
import { DEMO_PLAYERS, DEMO_SERVERS, demoServerKey } from '../src/demo/demo-cast.js';
import { DemoNotAllowed, demoSettings } from '../src/demo/demo-guard.js';
import { createSimServer, tick } from '../src/demo/demo-match.js';
import { seeded, uuidFor } from '../src/demo/demo-random.js';
import { type SeedServices, seedDemo } from '../src/demo/demo-seed.js';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { Inventory } from '../src/inventory/inventory.js';
import { Loadouts } from '../src/loadout/loadouts.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { VipPeriods } from '../src/vip/vip-periods.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

const SECRET = 'segredo-da-homologacao-'.padEnd(48, 'x');
const OWNER = steamIdFor(4242);

describe('Demonstração da homologação', () => {
  let t: TestApp;
  let services: SeedServices;
  const settings = {
    secret: SECRET,
    ownerSteamId: OWNER,
    publicWebUrl: 'https://dev.stcarmine.com',
  };
  const log = () => {};

  beforeAll(async () => {
    t = await startTestApp();
    services = {
      db: t.app.get(DATABASE),
      accounts: t.app.get(AccountsService),
      inventory: t.app.get(Inventory),
      loadouts: t.app.get(Loadouts),
      vip: t.app.get(VipPeriods),
      staffRoles: t.app.get(StaffRoles),
      catalog: t.app.get(Catalog),
    };
    // O servidor "retake-teste" do startTestApp não é da demonstração: aposenta, como a homologação
    // (um banco novo) nunca o teria.
    await t.app.get(GameServerRegistry).retire({ name: 'retake-teste' });
  });

  afterAll(async () => {
    await t?.stop();
  });

  const counts = async () => {
    const [stats] = await services.db.select({ n: count() }).from(accountStatsWeekly);
    const [items] = await services.db.select({ n: count() }).from(inventoryItems);
    const [people] = await services.db.select({ n: count() }).from(accounts);
    return { stats: stats?.n, items: items?.n, people: people?.n };
  };

  it('semeia servidores, contas, estatísticas, inventário e o dono', async () => {
    await seedDemo(services, settings, new Date(), log);

    const registry = t.app.get(GameServerRegistry);
    const listed = await registry.list();
    expect(listed.map((server) => server.name).sort()).toEqual(
      DEMO_SERVERS.map((server) => server.name).sort(),
    );
    for (const server of DEMO_SERVERS) {
      const authenticated = await registry.authenticate(demoServerKey(SECRET, server.name));
      expect(authenticated?.name).toBe(server.name);
      expect(authenticated?.code).toBe(server.code);
    }

    const [owner] = await services.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.steamId, BigInt(OWNER)));
    const ownerId = owner?.id as string;
    expect(await services.staffRoles.roleOf(ownerId)).toBe('owner');
    expect((await services.vip.statusOf(ownerId)).active).toBe(true);
    expect((await services.inventory.list(ownerId)).length).toBeGreaterThanOrEqual(12);
    const presets = await services.loadouts.listPresets(ownerId);
    expect(presets.presets.map((preset) => preset.name)).toEqual(
      expect.arrayContaining(['Competitivo', 'Casual']),
    );
    expect((await services.loadouts.get(ownerId)).entries.some((entry) => entry.uid !== null)).toBe(
      true,
    );
    const [staff] = await services.db.select({ n: count() }).from(staffMembers);
    expect(staff?.n).toBe(1);
  });

  it('o Ranking tem gente nos dois Modos', async () => {
    for (const mode of ['retake', 'deathmatch'] as const) {
      const response = await t.app.inject({ url: `/api/ranking/${mode}` });
      expect(response.statusCode).toBe(200);
      const ranking = rankingSchema.parse(response.json());
      expect(ranking.entries.length, mode).toBeGreaterThanOrEqual(6);
    }
  });

  it('os servidores fictícios batem e jogam pela API de verdade', async () => {
    const random = seeded('integracao');
    let n = 0;
    const newId = () => uuidFor(`int:${n++}`);
    const now = new Date();

    for (const def of DEMO_SERVERS) {
      const key = demoServerKey(SECRET, def.name);
      const headers = { authorization: `Bearer ${key}` };
      const state = createSimServer(def, now, random);
      let accepted = 0;
      for (let step = 0; step < 30; step++) {
        const at = new Date(now.getTime() - (30 - step) * 10_000);
        const { heartbeat, batch } = tick(state, at, random, newId);
        const beat = await t.app.inject({
          method: 'POST',
          url: '/api/server/heartbeat',
          headers,
          payload: heartbeat,
        });
        expect(beat.statusCode, beat.body).toBe(200);
        serverHeartbeatResultSchema.parse(beat.json());
        if (batch) {
          const sent = await t.app.inject({
            method: 'POST',
            url: '/api/server/events',
            headers,
            payload: batch,
          });
          expect(sent.statusCode, sent.body).toBe(200);
          accepted += eventBatchResultSchema.parse(sent.json()).accepted;
        }
      }
      expect(accepted, def.name).toBeGreaterThan(0);
    }

    const list = liveServerListSchema.parse((await t.app.inject({ url: '/api/servers' })).json());
    expect(list.servers).toHaveLength(DEMO_SERVERS.length);
    expect(list.servers.every((server) => server.state !== 'offline')).toBe(true);
    expect(list.servers.find((server) => server.name === 'retake-2')?.state).toBe('full');
  });

  it('rodar de novo completa sem duplicar nem somar', async () => {
    const before = await counts();
    await seedDemo(services, settings, new Date(), log);
    expect(await counts()).toEqual(before);
    expect(DEMO_PLAYERS.length).toBeGreaterThan(0);
  });

  it('recusa um banco com Servidor Carmine de verdade', async () => {
    await t.app
      .get(GameServerRegistry)
      .register({ name: 'retake-sp-01', mode: 'retake', address: '203.0.113.99:27015' });
    await expect(seedDemo(services, settings, new Date(), log)).rejects.toThrow(DemoNotAllowed);
  });

  it('a trava recusa o ambiente de produção', () => {
    expect(() =>
      demoSettings({
        CARMINE_DEMO: 'homologacao',
        PUBLIC_WEB_URL: 'https://stcarmine.com',
        DEMO_SEED_SECRET: SECRET,
      }),
    ).toThrow(DemoNotAllowed);
  });
});
