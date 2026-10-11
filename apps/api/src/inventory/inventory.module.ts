import { Module } from '@nestjs/common';
import { DATABASE, type Database } from '../database/database.module.js';
import { VipModule } from '../vip/vip.module.js';
import { VipPeriods } from '../vip/vip-periods.js';
import { InventoryController } from './inventory.controller.js';
import { Inventory } from './inventory.js';
import { ItemRules } from './item-rules.js';

/** Inventário das Contas (S04). O catálogo da cs2-lib é carregado uma vez, na subida. */
@Module({
  imports: [VipModule],
  controllers: [InventoryController],
  providers: [
    { provide: ItemRules, useFactory: () => new ItemRules() },
    {
      provide: Inventory,
      inject: [DATABASE, ItemRules, VipPeriods],
      useFactory: (db: Database, rules: ItemRules, vip: VipPeriods) =>
        new Inventory(db, rules, vip),
    },
  ],
  exports: [Inventory],
})
export class InventoryModule {}
