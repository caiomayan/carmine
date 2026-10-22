import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { FriendsModule } from '../friends/friends.module.js';
import { FriendsPlayingFinder } from '../friends/friends-playing.js';
import { Inventory } from '../inventory/inventory.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { LiveServers } from '../live-servers/live-servers.js';
import { LiveServersModule } from '../live-servers/live-servers.module.js';
import { LoadoutModule } from '../loadout/loadout.module.js';
import { Loadouts } from '../loadout/loadouts.js';
import { StatsModule } from '../stats/stats.module.js';
import { WeeklyRanking } from '../stats/weekly-ranking.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { HeaderPreviewsController } from './header-previews.controller.js';
import { HeaderPreviewsReader } from './header-previews.js';

/** Prévias dos painéis do header (U3e): junta Jogar, Loadout, Inventário e Ranking numa resposta. */
@Module({
  imports: [
    AccountsModule,
    LiveServersModule,
    FriendsModule,
    LoadoutModule,
    InventoryModule,
    StatsModule,
  ],
  controllers: [HeaderPreviewsController],
  providers: [
    {
      provide: HeaderPreviewsReader,
      inject: [
        DATABASE,
        VALKEY,
        AccountsService,
        LiveServers,
        FriendsPlayingFinder,
        Loadouts,
        Inventory,
        WeeklyRanking,
        APP_CONFIG,
      ],
      useFactory: (
        db: Database,
        valkey: Redis,
        accounts: AccountsService,
        live: LiveServers,
        friends: FriendsPlayingFinder,
        loadouts: Loadouts,
        inventory: Inventory,
        ranking: WeeklyRanking,
        config: AppConfig,
      ) =>
        new HeaderPreviewsReader(
          { db, valkey, accounts, live, friends, loadouts, inventory, ranking },
          config.headerPreviewsCacheTtlSeconds,
        ),
    },
  ],
})
export class HeaderPreviewsModule {}
