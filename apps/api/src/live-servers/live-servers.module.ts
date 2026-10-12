import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { GameServerRegistry } from '../game-servers/game-server-registry.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { LiveServerStreams } from './live-server-streams.js';
import { HeartbeatController, LiveServersController } from './live-servers.controller.js';
import { LiveServers } from './live-servers.js';
import { ServerPresenceStore } from './server-presence-store.js';

/** Servidores ao vivo (S06): batimento, presença no Valkey, lista pública e SSE. */
@Module({
  imports: [GameServersModule],
  controllers: [HeartbeatController, LiveServersController],
  providers: [
    {
      provide: LiveServers,
      inject: [GameServerRegistry, VALKEY, APP_CONFIG],
      useFactory: (registry: GameServerRegistry, valkey: Redis, config: AppConfig) =>
        new LiveServers(registry, new ServerPresenceStore(valkey), config.liveServers),
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
