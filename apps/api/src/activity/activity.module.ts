import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServerRegistry } from '../game-servers/game-server-registry.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { ActivityController } from './activity.controller.js';
import { ActivityFeed } from './activity-feed.js';
import { RecentActivityReader } from './recent-activity.js';

/**
 * A faixa de atividade ao vivo da home (Marquee): o {@link ActivityFeed} que os outros módulos
 * alimentam (entrar, multi-kill, skin equipada, novo primeiro lugar) e a leitura pública.
 */
@Module({
  imports: [GameServersModule],
  controllers: [ActivityController],
  providers: [
    {
      provide: ActivityFeed,
      inject: [VALKEY],
      useFactory: (valkey: Redis) => new ActivityFeed(valkey),
    },
    {
      provide: RecentActivityReader,
      inject: [DATABASE, VALKEY, ActivityFeed, GameServerRegistry, APP_CONFIG],
      useFactory: (
        db: Database,
        valkey: Redis,
        feed: ActivityFeed,
        servers: GameServerRegistry,
        config: AppConfig,
      ) => new RecentActivityReader({ db, valkey, feed, servers }, config.activityCacheTtlSeconds),
    },
  ],
  exports: [ActivityFeed],
})
export class ActivityModule {}
