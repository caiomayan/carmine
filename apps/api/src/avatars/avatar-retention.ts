import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { and, count, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountAvatars, avatarReports } from '../database/schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Quanto tempo o registro de uma foto que deixou de ser a da Conta (trocada, devolvida à Steam ou removida pela
 * Staff) e as denúncias contra ela ficam no banco. O histórico serve à Staff e aos limites de envio; depois
 * disso a linha some. Os arquivos não dependem disto: saem pela fila de remoção (quando a foto sai do histórico das
 * últimas 5 ou é apagada, ou aos 30 dias para as removidas). A foto que ainda está no histórico, com arquivos,
 * nunca é tocada.
 */
export const AVATAR_RECORD_RETENTION_DAYS = 90;

export interface AvatarRetentionResult {
  avatars: number;
  reports: number;
}

/**
 * A limpeza de retenção das fotos (ADR 0022 e 0025): apaga os registros de fotos removidas, ou trocadas e devolvidas
 * que já saíram do histórico (`deletedAt`), com mais de {@link AVATAR_RECORD_RETENTION_DAYS} dias e, em cascata, as
 * denúncias contra elas. A foto no ar, suspensa ou no histórico nunca é tocada. Apagar duas vezes não faz mal, então
 * várias instâncias não se atrapalham.
 */
export class AvatarRetention {
  private readonly logger = new Logger(AvatarRetention.name);

  constructor(private readonly db: Database) {}

  async sweep(now = new Date()): Promise<AvatarRetentionResult> {
    const cutoff = new Date(now.getTime() - AVATAR_RECORD_RETENTION_DAYS * DAY_MS);
    // Quando a foto deixou de valer; sem a data (não deveria faltar), vale o que houver de mais antigo.
    const retiredAt = sql`coalesce(${accountAvatars.retiredAt}, ${accountAvatars.takenDownAt}, ${accountAvatars.createdAt})`;
    const result = await this.db.transaction(async (tx) => {
      const old = await tx
        .select({ id: accountAvatars.id })
        .from(accountAvatars)
        .where(
          and(
            or(
              eq(accountAvatars.status, 'removed'),
              and(
                inArray(accountAvatars.status, ['replaced', 'reverted']),
                isNotNull(accountAvatars.deletedAt),
              ),
            ),
            lt(retiredAt, cutoff),
          ),
        );
      if (old.length === 0) return { avatars: 0, reports: 0 };
      const ids = old.map((row) => row.id);
      const [reports] = await tx
        .select({ total: count() })
        .from(avatarReports)
        .where(inArray(avatarReports.avatarId, ids));
      // As denúncias saem junto, pela chave estrangeira em cascata.
      await tx.delete(accountAvatars).where(inArray(accountAvatars.id, ids));
      return { avatars: ids.length, reports: reports?.total ?? 0 };
    });
    if (result.avatars > 0) {
      this.logger.log(
        `Retenção das fotos: ${result.avatars} registros e ${result.reports} denúncias apagados`,
      );
    }
    return result;
  }
}

/** Roda a {@link AvatarRetention} ao subir e depois no intervalo; `intervalMs` 0 desliga. Nunca rejeita. */
export class AvatarRetentionJob implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AvatarRetentionJob.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly retention: Pick<AvatarRetention, 'sweep'>,
    private readonly intervalMs: number,
  ) {}

  onModuleInit(): void {
    if (this.intervalMs <= 0) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async run(): Promise<void> {
    try {
      await this.retention.sweep();
    } catch (error) {
      this.logger.warn(`Retenção das fotos falhou: ${(error as Error).message}`);
    }
  }
}
