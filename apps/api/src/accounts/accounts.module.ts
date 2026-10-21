import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { LoadoutModule } from '../loadout/loadout.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
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
  imports: [GameServersModule, LoadoutModule, ModerationModule, VipModule],
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
