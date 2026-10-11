import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AccountsModule } from './accounts/accounts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientIpModule } from './client-ip/client-ip.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import type { AppConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { EquippedModule } from './equipped/equipped.module.js';
import { GameServersModule } from './game-servers/game-servers.module.js';
import { HealthModule } from './health/health.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { loggerParams } from './logging.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { ValkeyModule } from './valkey/valkey.module.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(config),
        LoggerModule.forRoot(loggerParams(config)),
        DatabaseModule,
        ValkeyModule,
        ClientIpModule,
        RateLimitModule,
        HealthModule,
        GameServersModule,
        AccountsModule,
        AuthModule,
        EquippedModule,
        InventoryModule,
      ],
    };
  }
}
