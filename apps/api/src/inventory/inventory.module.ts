import { Module } from '@nestjs/common';
import { Catalog } from '../catalog/catalog.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { EquippedModule } from '../equipped/equipped.module.js';
import { EquippedCache } from '../equipped/equipped-cache.js';
import { VipModule } from '../vip/vip.module.js';
import { VipPeriods } from '../vip/vip-periods.js';
import { InventoryController } from './inventory.controller.js';
import { Inventory } from './inventory.js';
import { ItemRules } from './item-rules.js';

/** Inventário das Contas (S04). O catálogo da cs2-lib vem do `CatalogModule`, carregado uma vez. */
@Module({
  imports: [VipModule, EquippedModule],
  controllers: [InventoryController],
  providers: [
    {
      provide: ItemRules,
      inject: [Catalog],
      useFactory: (catalog: Catalog) => new ItemRules(catalog),
    },
    {
      provide: Inventory,
      inject: [DATABASE, ItemRules, VipPeriods, EquippedCache],
      useFactory: (db: Database, rules: ItemRules, vip: VipPeriods, cache: EquippedCache) =>
        new Inventory(db, rules, vip, cache),
    },
  ],
  exports: [Inventory],
})
export class InventoryModule {}
