import { Module } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { HealthController, ServerHealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [GameServersModule],
  controllers: [HealthController, ServerHealthController],
  providers: [
    {
      provide: HealthService,
      inject: [APP_CONFIG, DATABASE, VALKEY],
      useFactory: (config: AppConfig, db: Database, valkey: Redis) =>
        new HealthService(
          {
            database: async () => {
              await db.execute(sql`select 1`);
            },
            valkey: async () => {
              await valkey.ping();
            },
          },
          config.healthCheckTimeoutMs,
        ),
    },
  ],
})
export class HealthModule {}
