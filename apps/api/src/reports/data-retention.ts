import {
  CHAT_RETENTION_DAYS,
  GAME_EVENT_RETENTION_DAYS,
  REPORT_RETENTION_DAYS,
} from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import { inArray, lt } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { chatMessages, gameEvents, reports } from '../database/schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Linhas de `game_events` apagadas por comando, para a limpeza não segurar a tabela por muito tempo. */
const GAME_EVENT_BATCH_SIZE = 5_000;

export interface RetentionResult {
  chatMessages: number;
  reports: number;
  gameEvents: number;
}

/**
 * A limpeza de privacidade (S13): o log de chat some depois de 30 dias e a Denúncia (com a cópia
 * do chat que ela guarda) depois de 90 dias, qualquer que seja o estado. A Punição aplicada a
 * partir dela é outro registro e continua. Roda ao subir a API e a cada hora (`RetentionJob`);
 * apagar duas vezes não faz mal, então várias instâncias não se atrapalham.
 *
 * Também apaga os IDs de `game_events` (a chave da idempotência dos eventos, ADR 0018) com mais de
 * 30 dias, em lotes: o plugin nunca guarda um evento por mais de algumas horas, então um ID tão
 * velho não volta a chegar.
 */
export class DataRetention {
  private readonly logger = new Logger(DataRetention.name);

  private readonly batchSize: number;

  constructor(
    private readonly db: Database,
    options: { batchSize?: number } = {},
  ) {
    this.batchSize = options.batchSize ?? GAME_EVENT_BATCH_SIZE;
  }

  async sweep(now = new Date()): Promise<RetentionResult> {
    const chat = await this.db
      .delete(chatMessages)
      .where(lt(chatMessages.receivedAt, new Date(now.getTime() - CHAT_RETENTION_DAYS * DAY_MS)))
      .returning({ id: chatMessages.id });
    const old = await this.db
      .delete(reports)
      .where(lt(reports.createdAt, new Date(now.getTime() - REPORT_RETENTION_DAYS * DAY_MS)))
      .returning({ id: reports.id });
    const events = await this.sweepGameEvents(
      new Date(now.getTime() - GAME_EVENT_RETENTION_DAYS * DAY_MS),
    );
    if (chat.length > 0 || old.length > 0 || events > 0) {
      this.logger.log(
        `Limpeza de retenção: ${chat.length} mensagem(ns) de chat, ${old.length} Denúncia(s) e ${events} ID(s) de evento apagados`,
      );
    }
    return { chatMessages: chat.length, reports: old.length, gameEvents: events };
  }

  /** Apaga os IDs de evento recebidos antes de `cutoff`, `batchSize` por vez, até acabar. */
  private async sweepGameEvents(cutoff: Date): Promise<number> {
    let total = 0;
    for (;;) {
      const batch = this.db
        .select({ id: gameEvents.id })
        .from(gameEvents)
        .where(lt(gameEvents.receivedAt, cutoff))
        .limit(this.batchSize);
      const { rowCount } = await this.db.delete(gameEvents).where(inArray(gameEvents.id, batch));
      total += rowCount ?? 0;
      if ((rowCount ?? 0) < this.batchSize) return total;
    }
  }
}
