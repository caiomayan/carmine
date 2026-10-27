import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AccountErasure } from '../accounts/account-erasure.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { DisplayNames } from '../accounts/display-names.js';
import { Analytics } from '../analytics/analytics.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { SessionStore } from '../auth/sessions.js';
import { SessionsModule } from '../auth/sessions.module.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { DiscordModule } from '../discord/discord.module.js';
import { DISCORD, type DiscordIntegration } from '../discord/discord-integration.js';
import { EquippedModule } from '../equipped/equipped.module.js';
import { EquippedCache } from '../equipped/equipped-cache.js';
import { GameServerRegistry } from '../game-servers/game-server-registry.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { Sanctions } from '../moderation/sanctions.js';
import { ReportsModule } from '../reports/reports.module.js';
import { StaffReports } from '../reports/staff-reports.js';
import { RankingCache } from '../stats/ranking-cache.js';
import { RankingRemovals } from '../stats/ranking-removals.js';
import { VALKEY } from '../valkey/valkey.module.js';
import { VipModule } from '../vip/vip.module.js';
import { VipPeriods } from '../vip/vip-periods.js';
import { StaffAuditLog } from './audit-log.js';
import { StaffController } from './staff.controller.js';
import { StaffGuard } from './staff.guard.js';
import { StaffPanel } from './staff-panel.js';
import { StaffRoles } from './staff-roles.js';

/** Painel da Staff (S07), em `/api/staff/*`. */
@Module({
  imports: [
    AccountsModule,
    SessionsModule,
    ModerationModule,
    VipModule,
    EquippedModule,
    GameServersModule,
    ReportsModule,
    DiscordModule,
    AnalyticsModule,
  ],
  controllers: [StaffController],
  providers: [
    StaffGuard,
    {
      provide: StaffPanel,
      inject: [
        DATABASE,
        AccountsService,
        DisplayNames,
        Sanctions,
        StaffRoles,
        StaffAuditLog,
        VipPeriods,
        SessionStore,
        GameServerRegistry,
        EquippedCache,
        StaffReports,
        VALKEY,
        APP_CONFIG,
        DISCORD,
        Analytics,
      ],
      useFactory: (
        db: Database,
        accounts: AccountsService,
        displayNames: DisplayNames,
        sanctions: Sanctions,
        roles: StaffRoles,
        audit: StaffAuditLog,
        vip: VipPeriods,
        sessions: SessionStore,
        servers: GameServerRegistry,
        equipped: EquippedCache,
        reports: StaffReports,
        valkey: Redis,
        config: AppConfig,
        discord: DiscordIntegration | null,
        analytics: Analytics,
      ) =>
        new StaffPanel({
          db,
          accounts,
          displayNames,
          sanctions,
          roles,
          audit,
          vip,
          sessions,
          servers,
          reports,
          erasure: new AccountErasure(db, {
            dropSessions: (accountId) => sessions.destroyAllOf(accountId),
            invalidateEquipped: (steamId) => equipped.invalidate(steamId),
            ...(discord && { removeDiscordRoles: (id) => discord.roles.strip(id) }),
            erasePerson: (accountId) => analytics.erasePerson(accountId),
          }),
          invalidateEquipped: (steamId) => equipped.invalidate(steamId),
          rankingRemovals: new RankingRemovals(db, (mode, weekStart) =>
            new RankingCache(valkey, config.rankingCacheTtlSeconds).invalidate(mode, weekStart),
          ),
        }),
    },
  ],
})
export class StaffModule {}
