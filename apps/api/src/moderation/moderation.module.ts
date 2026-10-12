import { APPEAL_PATH } from '@carmine/contracts';
import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { StaffAuditLog } from '../staff/audit-log.js';
import { StaffRoles } from '../staff/staff-roles.js';
import { Sanctions } from './sanctions.js';

/** Onde recorrer, como aparece no jogo: o host do web e a página de regras (`stcarmine.com/regras#recurso`). */
export function appealText(publicWebUrl: string): string {
  return `${new URL(publicWebUrl).host}${APPEAL_PATH}`;
}

/**
 * Moderação (S07): Punições, papéis da Staff e o log de auditoria. Não depende de nada além do
 * banco; o login, o Perfil, o batimento e o painel da Staff leem daqui.
 */
@Module({
  providers: [
    {
      provide: Sanctions,
      inject: [DATABASE, APP_CONFIG],
      useFactory: (db: Database, config: AppConfig) =>
        new Sanctions(db, appealText(config.publicWebUrl)),
    },
    { provide: StaffRoles, inject: [DATABASE], useFactory: (db: Database) => new StaffRoles(db) },
    {
      provide: StaffAuditLog,
      inject: [DATABASE],
      useFactory: (db: Database) => new StaffAuditLog(db),
    },
  ],
  exports: [Sanctions, StaffRoles, StaffAuditLog],
})
export class ModerationModule {}
