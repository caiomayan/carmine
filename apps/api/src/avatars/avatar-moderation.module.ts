import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { DiscordWebhook } from '../alerts/discord-webhook.js';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { StaffGuard } from '../staff/staff.guard.js';
import { AvatarFiles } from './avatar-files.js';
import { AvatarReportsController } from './avatar-moderation.controller.js';
import { AvatarModeration } from './avatar-moderation.js';
import { AvatarReportNotifier } from './avatar-moderation-discord.js';
import { AvatarsModule } from './avatars.module.js';
import { MediaDeletions } from './media-deletions.js';
import { StaffAvatarsController } from './staff-avatars.controller.js';

/**
 * A moderação da foto de perfil (ADR 0022): a denúncia no Perfil, a suspensão automática com duas
 * Contas diferentes, a fila e a decisão da Staff, a remoção em um clique, o bloqueio de reincidente
 * e o aviso no Discord. Usa os arquivos e a fila de remoção do {@link AvatarsModule}.
 */
@Module({
  imports: [AvatarsModule, AccountsModule, ModerationModule],
  controllers: [AvatarReportsController, StaffAvatarsController],
  providers: [
    StaffGuard,
    {
      provide: AvatarReportNotifier,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new AvatarReportNotifier(
          new DiscordWebhook(config.reports.webhookUrl),
          `${config.publicWebUrl}/staff/fotos`,
        ),
    },
    {
      provide: AvatarModeration,
      inject: [DATABASE, AvatarFiles, MediaDeletions, AvatarReportNotifier, APP_CONFIG],
      useFactory: (
        db: Database,
        files: AvatarFiles,
        deletions: MediaDeletions,
        notifier: AvatarReportNotifier,
        config: AppConfig,
      ) => new AvatarModeration(db, files, deletions, notifier, config.media !== null),
    },
  ],
})
export class AvatarModerationModule {}
