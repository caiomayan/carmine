import { type DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AccountsModule } from './accounts/accounts.module.js';
import { ActivityModule } from './activity/activity.module.js';
import { AlertsModule } from './alerts/alerts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AvatarsModule } from './avatars/avatars.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ClientIpModule } from './client-ip/client-ip.module.js';
import { AppConfigModule } from './config/app-config.module.js';
import type { AppConfig } from './config/config.js';
import { DatabaseModule } from './database/database.module.js';
import { DiscordModule } from './discord/discord.module.js';
import { EquippedModule } from './equipped/equipped.module.js';
import { FriendsModule } from './friends/friends.module.js';
import { GameServersModule } from './game-servers/game-servers.module.js';
import { HeaderPreviewsModule } from './header-previews/header-previews.module.js';
import { HealthModule } from './health/health.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { LiveServersModule } from './live-servers/live-servers.module.js';
import { LoadoutModule } from './loadout/loadout.module.js';
import { loggerParams } from './logging.js';
import { RateLimitModule } from './rate-limit/rate-limit.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { StaffModule } from './staff/staff.module.js';
import { StatsModule } from './stats/stats.module.js';
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
        CatalogModule,
        ClientIpModule,
        RateLimitModule,
        HealthModule,
        GameServersModule,
        AccountsModule,
        AuthModule,
        EquippedModule,
        InventoryModule,
        LoadoutModule,
        LiveServersModule,
        FriendsModule,
        StaffModule,
        AlertsModule,
        DiscordModule,
        StatsModule,
        HeaderPreviewsModule,
        ActivityModule,
        ReportsModule,
        AvatarsModule,
      ],
    };
  }
}
