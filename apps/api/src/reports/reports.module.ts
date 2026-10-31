import { Module } from '@nestjs/common';
import { DiscordWebhook } from '../alerts/discord-webhook.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { GameServersModule } from '../game-servers/game-servers.module.js';
import { DataRetention } from './data-retention.js';
import { ReportNotifier } from './report-discord.js';
import { Reports } from './reports.js';
import { RetentionJob } from './retention-job.js';
import { ServerReportsController } from './server-reports.controller.js';
import { StaffReports } from './staff-reports.js';

/**
 * Denúncias (S13): o `!report` do jogo, a fila da Staff (lida pelo painel), o aviso no Discord e a
 * limpeza de retenção do chat e das Denúncias.
 */
@Module({
  imports: [GameServersModule, AnalyticsModule],
  controllers: [ServerReportsController],
  providers: [
    { provide: Reports, inject: [DATABASE], useFactory: (db: Database) => new Reports(db) },
    {
      provide: StaffReports,
      inject: [DATABASE],
      useFactory: (db: Database) => new StaffReports(db),
    },
    {
      provide: ReportNotifier,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new ReportNotifier(
          new DiscordWebhook(config.reports.webhookUrl),
          `${config.publicWebUrl}/staff/denuncias`,
        ),
    },
    {
      provide: DataRetention,
      inject: [DATABASE],
      useFactory: (db: Database) => new DataRetention(db),
    },
    {
      provide: RetentionJob,
      inject: [DataRetention, APP_CONFIG],
      useFactory: (retention: DataRetention, config: AppConfig) =>
        new RetentionJob(retention, config.reports.retentionSweepMs),
    },
  ],
  exports: [StaffReports, DataRetention],
})
export class ReportsModule {}
