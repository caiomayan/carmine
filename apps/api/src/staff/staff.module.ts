import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AccountErasure } from '../accounts/account-erasure.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { DisplayNames } from '../accounts/display-names.js';
import { SessionStore } from '../auth/sessions.js';
import { SessionsModule } from '../auth/sessions.module.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { EquippedModule } from '../equipped/equipped.module.js';
import { EquippedCache } from '../equipped/equipped-cache.js';
import { GameServerRegistry } from '../game-servers/game-server-registry.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { Sanctions } from '../moderation/sanctions.js';
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
        VALKEY,
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
        valkey: Redis,
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
          erasure: new AccountErasure(db, {
            dropSessions: (accountId) => sessions.destroyAllOf(accountId),
            invalidateEquipped: (steamId) => equipped.invalidate(steamId),
          }),
          invalidateEquipped: (steamId) => equipped.invalidate(steamId),
          rankingRemovals: new RankingRemovals(db, (mode, weekStart) =>
            new RankingCache(valkey).invalidate(mode, weekStart),
          ),
        }),
    },
  ],
})
export class StaffModule {}
