import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigModule } from './config/app-config.module.js';
import type { AppConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { loggerParams } from './logging.js';
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
        HealthModule,
      ],
    };
  }
}
