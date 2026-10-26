import { isNull } from 'drizzle-orm';
import type { AccountsService } from '../accounts/accounts.service.js';
import type { Catalog } from '../catalog/catalog.js';
import type { Database } from '../database/database.js';
import { accountStatsWeekly, gameServers } from '../database/schema.js';
import { hashServerKey } from '../game-servers/server-key.js';
import type { Inventory } from '../inventory/inventory.js';
import { ItemRules } from '../inventory/item-rules.js';
import type { Loadouts } from '../loadout/loadouts.js';
import type { StaffRoles } from '../staff/staff-roles.js';
import type { VipPeriods } from '../vip/vip-periods.js';
import { DEMO_PLAYERS, DEMO_SERVER_NAMES, DEMO_SERVERS, demoServerKey } from './demo-cast.js';
import { assertDemoDatabase, type DemoSettings } from './demo-guard.js';
import {
  currentWeekFraction,
  type DemoWeekStats,
  demoWeeks,
  ownerWeekStats,
  weekStatsOf,
} from './demo-history.js';
import { demoWardrobe } from './demo-items.js';

export interface SeedServices {
  db: Database;
  accounts: AccountsService;
  inventory: Inventory;
  loadouts: Loadouts;
  vip: VipPeriods;
  staffRoles: StaffRoles;
  catalog: Catalog;
}

/** Quantos dias de VIP a demonstração concede (renovado quando acaba, a cada deploy). */
const VIP_DAYS = 60;

/**
 * Semeia a demonstração da homologação: Servidores Carmine fictícios (com chaves derivadas do
 * segredo), Contas fictícias (pelo mesmo caminho do connect do jogo), Estatísticas das últimas
 * semanas (o Ranking e o Perfil), VIP, Inventário e Loadout. Idempotente: roda a cada deploy e só
 * completa o que falta, sem somar duas vezes e sem apagar nada. O dono (`DEMO_OWNER_STEAM_ID`)
 * ganha a mesma demonstração na própria Conta, mais o papel de Dono para validar o painel da Staff.
 *
 * Quem chama já passou por {@link demoSettings}; aqui ainda se confere o banco.
 */
export async function seedDemo(
  services: SeedServices,
  settings: DemoSettings,
  now: Date,
  log: (line: string) => void,
): Promise<void> {
  const { db } = services;
  const operating = await db
    .select({ name: gameServers.name })
    .from(gameServers)
    .where(isNull(gameServers.retiredAt));
  assertDemoDatabase(
    operating.map((row) => row.name),
    DEMO_SERVER_NAMES,
  );

  await seedServers(db, settings.secret);
  log(`${DEMO_SERVERS.length} servidores fictícios`);

  const rules = new ItemRules(services.catalog);
  const accountIds = new Map<string, string>();
  for (const player of DEMO_PLAYERS) {
    const { accountId } = await services.accounts.registerConnect({
      steamId: player.steamId,
      steamName: player.name,
    });
    accountIds.set(player.steamId, accountId);
  }
  log(`${accountIds.size} contas fictícias`);

  const weeks = demoWeeks(now);
  const fraction = currentWeekFraction(now);
  const statsRows: Array<DemoWeekStats & { accountId: string }> = [];
  for (const player of DEMO_PLAYERS) {
    const accountId = accountIds.get(player.steamId) as string;
    weeks.forEach((weekStart, back) => {
      const stats = weekStatsOf(player, weekStart, fraction, back === 0);
      if (stats) statsRows.push({ accountId, ...stats });
    });
  }

  for (const player of DEMO_PLAYERS) {
    const accountId = accountIds.get(player.steamId) as string;
    if (player.vip) await ensureVip(services.vip, accountId, now);
    await dress(services, rules, accountId, player.steamId, player.vip);
  }

  if (settings.ownerSteamId !== null) {
    const { account } = await services.accounts.claimOnLogin(settings.ownerSteamId);
    await services.staffRoles.set(account.id, 'owner', {
      actorSteamId: settings.ownerSteamId,
      reason: 'Homologação: o dono da plataforma',
    });
    await ensureVip(services.vip, account.id, now, 90);
    weeks.forEach((weekStart, back) => {
      for (const stats of ownerWeekStats(weekStart, back, fraction)) {
        statsRows.push({ accountId: account.id, ...stats });
      }
    });
    await dress(services, rules, account.id, `dono:${settings.ownerSteamId}`, true, true);
    log('conta do dono: VIP, Dono, estatísticas, inventário e presets');
  }

  await insertStats(db, statsRows);
  log(`${statsRows.length} linhas de estatísticas semanais`);
}

async function seedServers(db: Database, secret: string): Promise<void> {
  for (const server of DEMO_SERVERS) {
    const values = {
      name: server.name,
      mode: server.mode,
      address: server.address,
      showcaseName: server.showcaseName,
      code: server.code,
      keyHash: hashServerKey(demoServerKey(secret, server.name)),
    };
    await db
      .insert(gameServers)
      .values(values)
      .onConflictDoUpdate({
        target: gameServers.name,
        set: { ...values, keyRotatedAt: new Date(), retiredAt: null },
      });
  }
}

/** Sem somar: o que o simulador já acumulou na semana atual não é tocado. */
async function insertStats(
  db: Database,
  rows: ReadonlyArray<DemoWeekStats & { accountId: string }>,
): Promise<void> {
  for (let start = 0; start < rows.length; start += 200) {
    await db
      .insert(accountStatsWeekly)
      .values(rows.slice(start, start + 200))
      .onConflictDoNothing();
  }
}

async function ensureVip(vip: VipPeriods, accountId: string, now: Date, days = VIP_DAYS) {
  const status = await vip.statusOf(accountId, now);
  if (!status.active) await vip.grant(accountId, days, now);
}

/**
 * Inventário e Loadout de exemplo, só se a Conta ainda não tem Itens (rodar de novo não duplica e
 * respeita o que o dono mexeu). Equipa tudo no Preset principal; o dono ainda ganha outros dois.
 */
async function dress(
  services: SeedServices,
  rules: ItemRules,
  accountId: string,
  seed: string,
  vip: boolean,
  withPresets = false,
): Promise<void> {
  const { inventory, loadouts, catalog } = services;
  if ((await inventory.list(accountId)).length > 0) return;
  const added = [];
  for (const item of demoWardrobe(catalog, rules, seed, vip)) {
    added.push(await inventory.add(accountId, item));
  }
  for (const entry of added) await loadouts.equip(accountId, { uid: entry.uid });
  if (!withPresets) return;

  const alternates = [];
  for (const item of demoWardrobe(catalog, rules, `${seed}:alt`, vip).slice(0, 4)) {
    alternates.push(await inventory.add(accountId, item));
  }
  await loadouts.createPreset(accountId, { name: 'Competitivo', from: 'current' });
  const casual = await loadouts.createPreset(accountId, { name: 'Casual', from: 'empty' });
  for (const entry of alternates) {
    await loadouts.equip(accountId, { uid: entry.uid, presetId: casual.id });
  }
}
