import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { SessionStore } from '../auth/sessions.js';
import { SessionsModule } from '../auth/sessions.module.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { EquippedModule } from '../equipped/equipped.module.js';
import { EquippedCache } from '../equipped/equipped-cache.js';
import { GameServerRegistry } from '../game-servers/game-server-registry.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { Sanctions } from '../moderation/sanctions.js';
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
        Sanctions,
        StaffRoles,
        StaffAuditLog,
        VipPeriods,
        SessionStore,
        GameServerRegistry,
        EquippedCache,
      ],
      useFactory: (
        db: Database,
        accounts: AccountsService,
        sanctions: Sanctions,
        roles: StaffRoles,
        audit: StaffAuditLog,
        vip: VipPeriods,
        sessions: SessionStore,
        servers: GameServerRegistry,
        equipped: EquippedCache,
      ) =>
        new StaffPanel({
          db,
          accounts,
          sanctions,
          roles,
          audit,
          vip,
          sessions,
          servers,
          invalidateEquipped: (steamId) => equipped.invalidate(steamId),
        }),
    },
  ],
})
export class StaffModule {}
