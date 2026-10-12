import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AccountsModule } from '../accounts/accounts.module.js';
import { SteamWebApi } from '../accounts/steam-profiles.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { LiveServers } from '../live-servers/live-servers.js';
import { LiveServersModule } from '../live-servers/live-servers.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { CachedFriendLists } from './cached-friend-lists.js';
import { FriendsPlayingController } from './friends-playing.controller.js';
import { FriendsPlayingFinder } from './friends-playing.js';

/** "Seus amigos jogando agora" (S06). Sem chave da Steam Web API, o bloco fica indisponível. */
@Module({
  imports: [AccountsModule, LiveServersModule],
  controllers: [FriendsPlayingController],
  providers: [
    {
      provide: FriendsPlayingFinder,
      inject: [APP_CONFIG, VALKEY, LiveServers, DATABASE],
      useFactory: (config: AppConfig, valkey: Redis, live: LiveServers, db: Database) => {
        const { key, url, timeoutMs } = config.steamWebApi;
        const steam = key === null ? null : new SteamWebApi({ key, url, timeoutMs });
        return new FriendsPlayingFinder(new CachedFriendLists(steam, valkey), live, db);
      },
    },
  ],
})
export class FriendsModule {}
