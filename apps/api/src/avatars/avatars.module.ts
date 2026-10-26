import { Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { ModerationModule } from '../moderation/moderation.module.js';
import { Sanctions } from '../moderation/sanctions.js';
import { AvatarFiles } from './avatar-files.js';
import { AvatarsController } from './avatars.controller.js';
import { Avatars } from './avatars.js';
import { MediaDeletionJob, MediaDeletions } from './media-deletions.js';
import {
  CDN_PURGER,
  type CdnPurger,
  CloudflarePurger,
  MEDIA_STORAGE,
  type MediaStorage,
  NoPurger,
  R2MediaStorage,
} from './media-storage.js';

/**
 * Foto de perfil própria (ADR 0022): o R2 de mídia (separado do backup), a fila de remoção de
 * arquivos e a rota `/api/me/avatar`. Sem o conjunto base de variáveis `R2_MEDIA_*` e
 * `MEDIA_PUBLIC_URL`, a funcionalidade fica desligada e o resto do site não muda.
 */
@Module({
  imports: [ModerationModule],
  controllers: [AvatarsController],
  providers: [
    {
      provide: MEDIA_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): MediaStorage | null => {
        if (config.media === null) {
          if (config.mediaMissing.length > 0) {
            new Logger('Media').warn(
              `Foto de perfil desligada: faltam ${config.mediaMissing.join(', ')} (preencha todas as variáveis base)`,
            );
          }
          return null;
        }
        return new R2MediaStorage(config.media);
      },
    },
    {
      provide: CDN_PURGER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): CdnPurger =>
        config.media?.purge ? new CloudflarePurger(config.media.purge) : new NoPurger(),
    },
    {
      provide: MediaDeletions,
      inject: [DATABASE, MEDIA_STORAGE, CDN_PURGER, APP_CONFIG],
      useFactory: (
        db: Database,
        storage: MediaStorage | null,
        purger: CdnPurger,
        config: AppConfig,
      ) => new MediaDeletions(db, storage, purger, config.media?.publicUrl ?? null),
    },
    {
      provide: MediaDeletionJob,
      inject: [MediaDeletions, APP_CONFIG],
      useFactory: (deletions: MediaDeletions, config: AppConfig) =>
        new MediaDeletionJob(deletions, config.media?.sweepMs ?? 0),
    },
    {
      provide: AvatarFiles,
      inject: [MEDIA_STORAGE, MediaDeletions, APP_CONFIG],
      useFactory: (storage: MediaStorage | null, deletions: MediaDeletions, config: AppConfig) =>
        new AvatarFiles(storage, deletions, config.media?.publicUrl ?? null),
    },
    {
      provide: Avatars,
      inject: [DATABASE, AvatarFiles, Sanctions, APP_CONFIG],
      useFactory: (db: Database, files: AvatarFiles, sanctions: Sanctions, config: AppConfig) =>
        new Avatars(db, files, sanctions, config.media !== null),
    },
  ],
  exports: [Avatars, AvatarFiles, MediaDeletions],
})
export class AvatarsModule {}
