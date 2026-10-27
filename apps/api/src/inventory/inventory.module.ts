import { Module } from '@nestjs/common';
import { Analytics } from '../analytics/analytics.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
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
  imports: [VipModule, EquippedModule, AnalyticsModule],
  controllers: [InventoryController],
  providers: [
    {
      provide: ItemRules,
      inject: [Catalog],
      useFactory: (catalog: Catalog) => new ItemRules(catalog),
    },
    {
      provide: Inventory,
      inject: [DATABASE, ItemRules, VipPeriods, EquippedCache, Analytics],
      useFactory: (
        db: Database,
        rules: ItemRules,
        vip: VipPeriods,
        cache: EquippedCache,
        analytics: Analytics,
      ) => new Inventory(db, rules, vip, cache, () => new Date(), analytics),
    },
  ],
  exports: [Inventory],
})
export class InventoryModule {}
