import { CHAT_RETENTION_DAYS, REPORT_RETENTION_DAYS } from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import { lt } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { chatMessages, reports } from '../database/schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionResult {
  chatMessages: number;
  reports: number;
}

/**
 * A limpeza de privacidade (S13): o log de chat some depois de 30 dias e a Denúncia (com a cópia
 * do chat que ela guarda) depois de 90 dias, qualquer que seja o estado. A Punição aplicada a
 * partir dela é outro registro e continua. Roda ao subir a API e a cada hora (`RetentionJob`);
 * apagar duas vezes não faz mal, então várias instâncias não se atrapalham.
 */
export class DataRetention {
  private readonly logger = new Logger(DataRetention.name);

  constructor(private readonly db: Database) {}

  async sweep(now = new Date()): Promise<RetentionResult> {
    const chat = await this.db
      .delete(chatMessages)
      .where(lt(chatMessages.receivedAt, new Date(now.getTime() - CHAT_RETENTION_DAYS * DAY_MS)))
      .returning({ id: chatMessages.id });
    const old = await this.db
      .delete(reports)
      .where(lt(reports.createdAt, new Date(now.getTime() - REPORT_RETENTION_DAYS * DAY_MS)))
      .returning({ id: reports.id });
    if (chat.length > 0 || old.length > 0) {
      this.logger.log(
        `Limpeza de retenção: ${chat.length} mensagem(ns) de chat e ${old.length} Denúncia(s) apagadas`,
      );
    }
    return { chatMessages: chat.length, reports: old.length };
  }
}
