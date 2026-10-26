import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServerRegistry } from '../game-servers/game-server-registry.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { LiveServerStreams } from './live-server-streams.js';
import { HeartbeatController, LiveServersController } from './live-servers.controller.js';
import { LiveServers } from './live-servers.js';
import { ServerPlayersReader } from './server-players.js';
import { ServerPresenceStore } from './server-presence-store.js';
import { ServerTodayCache, ServerTodayReader } from './server-today.js';

/** Servidores ao vivo (S06): batimento, presença no Valkey, lista pública e SSE. */
@Module({
  imports: [GameServersModule, ModerationModule],
  controllers: [HeartbeatController, LiveServersController],
  providers: [
    {
      provide: LiveServers,
      inject: [GameServerRegistry, VALKEY, APP_CONFIG],
      useFactory: (registry: GameServerRegistry, valkey: Redis, config: AppConfig) =>
        new LiveServers(registry, new ServerPresenceStore(valkey), config.liveServers),
    },
    {
      // A página do servidor (S12b): quem está lá agora e o histórico do dia.
      provide: ServerPlayersReader,
      inject: [DATABASE, APP_CONFIG],
      useFactory: (db: Database, config: AppConfig) =>
        new ServerPlayersReader(db, config.liveServers.offlineAfterMs),
    },
    {
      provide: ServerTodayReader,
      inject: [DATABASE, VALKEY],
      useFactory: (db: Database, valkey: Redis) =>
        new ServerTodayReader(db, new ServerTodayCache(valkey)),
    },
    {
      provide: LiveServerStreams,
      inject: [LiveServers],
      useFactory: (live: LiveServers) => new LiveServerStreams(live),
    },
  ],
  exports: [LiveServers],
})
export class LiveServersModule {}
