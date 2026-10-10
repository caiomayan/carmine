import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { AccountsService } from './accounts.service.js';
import { AvatarRefresher } from './avatar-refresher.js';
import { PlayerConnectsController } from './player-connects.controller.js';
import { SteamWebApi } from './steam-profiles.js';

@Module({
  imports: [GameServersModule],
  controllers: [PlayerConnectsController],
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
  ],
  exports: [AccountsService],
})
export class AccountsModule {}
