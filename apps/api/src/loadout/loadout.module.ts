import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { ActivityFeed } from '../activity/activity-feed.js';
import { Catalog } from '../catalog/catalog.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { EquippedModule } from '../equipped/equipped.module.js';
import { EquippedCache } from '../equipped/equipped-cache.js';
import { VipModule } from '../vip/vip.module.js';
import { VipPeriods } from '../vip/vip-periods.js';
import { LoadoutController, PresetsController } from './loadout.controller.js';
import { Loadouts } from './loadouts.js';

/** Loadout e Presets das Contas (S05). */
@Module({
  imports: [VipModule, EquippedModule, ActivityModule],
  controllers: [LoadoutController, PresetsController],
  providers: [
    {
      provide: Loadouts,
      inject: [DATABASE, Catalog, VipPeriods, EquippedCache, ActivityFeed],
      useFactory: (
        db: Database,
        catalog: Catalog,
        vip: VipPeriods,
        cache: EquippedCache,
        activity: ActivityFeed,
      ) => new Loadouts(db, catalog, vip, cache, undefined, activity),
    },
  ],
  exports: [Loadouts],
})
export class LoadoutModule {}
