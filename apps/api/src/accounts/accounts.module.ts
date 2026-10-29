import { Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { LoadoutModule } from '../loadout/loadout.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { Greetings } from '../stats/greeting.js';
import { RankingCache } from '../stats/ranking-cache.js';
import { WeeklyRanking } from '../stats/weekly-ranking.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { VipModule } from '../vip/vip.module.js';
import { AccountSettingsController } from './account-settings.controller.js';
import { AccountsService } from './accounts.service.js';
import { AvatarRefresher } from './avatar-refresher.js';
import { DisplayNames } from './display-names.js';
import { PlayerConnectsController } from './player-connects.controller.js';
import { PlayerPreferencesController } from './player-preferences.controller.js';
import { PlayerSearchController } from './player-search.controller.js';
import { PlayerSearcher } from './player-search.js';
import { ProfilesController } from './profiles.controller.js';
import { ReservedPublicIds } from './reserved-public-ids.js';
import { SteamWebApi } from './steam-profiles.js';

@Module({
  imports: [GameServersModule, LoadoutModule, ModerationModule, VipModule, AnalyticsModule],
  controllers: [
    AccountSettingsController,
    PlayerConnectsController,
    PlayerPreferencesController,
    PlayerSearchController,
    ProfilesController,
  ],
  providers: [
    {
      provide: AvatarRefresher,
      inject: [APP_CONFIG, DATABASE],
      useFactory: (config: AppConfig, db: Database) => {
        const { key, url, timeoutMs } = config.steamWebApi;
        if (key === null) {
          new Logger(AvatarRefresher.name).warn(
            'STEAM_WEB_API_KEY vazia: as Contas ficam com o avatar neutro',
          );
        }
        return new AvatarRefresher(
          db,
          key === null ? null : new SteamWebApi({ key, url, timeoutMs }),
        );
      },
    },
    {
      provide: AccountsService,
      inject: [DATABASE, AvatarRefresher],
      useFactory: (db: Database, avatars: AvatarRefresher) => new AccountsService(db, avatars),
    },
    {
      // A linha do connect (S16). O StatsModule importa este módulo, então a leitura do Ranking é montada
      // aqui mesmo, sobre o mesmo cache (a chave é a mesma).
      provide: Greetings,
      inject: [DATABASE, VALKEY, APP_CONFIG],
      useFactory: (db: Database, valkey: Redis, config: AppConfig) =>
        new Greetings(
          db,
          new WeeklyRanking(db, new RankingCache(valkey, config.rankingCacheTtlSeconds)),
        ),
    },
    {
      provide: PlayerSearcher,
      inject: [DATABASE],
      useFactory: (db: Database) => new PlayerSearcher(db),
    },
    {
      provide: DisplayNames,
      inject: [DATABASE],
      useFactory: (db: Database) => new DisplayNames(db),
    },
    {
      provide: ReservedPublicIds,
      inject: [DATABASE],
      useFactory: (db: Database) => new ReservedPublicIds(db),
    },
  ],
  exports: [AccountsService, DisplayNames, ReservedPublicIds],
})
export class AccountsModule {}
