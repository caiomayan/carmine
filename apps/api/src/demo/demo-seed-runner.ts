import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AccountsService } from '../accounts/accounts.service.js';
import { AppModule } from '../app.module.js';
import { Catalog } from '../catalog/catalog.js';
import { loadConfig } from '../config/config.js';
import { DATABASE } from '../database/database.module.js';
import { Inventory } from '../inventory/inventory.js';
import { Loadouts } from '../loadout/loadouts.js';
import { StaffRoles } from '../staff/staff-roles.js';
import { VipPeriods } from '../vip/vip-periods.js';
import type { DemoSettings } from './demo-guard.js';
import { seedDemo } from './demo-seed.js';

/**
 * Sobe a API sem escutar porta (só o grafo de módulos e as conexões) e semeia a demonstração com
 * os mesmos serviços que o site usa. Importado só pelo comando `seed`, para o simulador não carregar
 * a API inteira.
 */
export async function runSeed(settings: DemoSettings, log: (line: string) => void): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    AppModule.forRoot(loadConfig(process.env)),
    {
      logger: ['error', 'warn'],
    },
  );
  try {
    const get = <T>(token: abstract new (...args: never[]) => T) =>
      app.get(token, { strict: false });
    await seedDemo(
      {
        db: app.get(DATABASE, { strict: false }),
        accounts: get(AccountsService),
        inventory: get(Inventory),
        loadouts: get(Loadouts),
        vip: get(VipPeriods),
        staffRoles: get(StaffRoles),
        catalog: get(Catalog),
      },
      settings,
      new Date(),
      log,
    );
  } finally {
    await app.close();
  }
}
