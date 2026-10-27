import {
  CHAT_RETENTION_DAYS,
  GAME_EVENT_RETENTION_DAYS,
  PAYMENT_EVENT_RETENTION_DAYS,
  PLAY_SESSION_RETENTION_DAYS,
  REPORT_RETENTION_DAYS,
  SERVER_HOURS_RETENTION_DAYS,
  STATS_DAILY_RETENTION_DAYS,
} from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import { inArray, lt, type SQL, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Database } from '../database/database.js';
import {
  accountStatsDaily,
  chatMessages,
  gameEvents,
  paymentEvents,
  playSessions,
  reports,
  serverHours,
} from '../database/schema.js';
import { dayOf } from '../stats/stats-week.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Linhas de `game_events` apagadas por comando, para a limpeza não segurar a tabela por muito tempo. */
const GAME_EVENT_BATCH_SIZE = 5_000;

export interface RetentionResult {
  chatMessages: number;
  reports: number;
  gameEvents: number;
  /** S12b: o dado diário (400 dias), as Sessões de jogo (90) e as horas dos servidores (400). */
  statsDaily: number;
  playSessions: number;
  serverHours: number;
  /** S14: os webhooks de pagamento recebidos (12 meses). */
  paymentEvents: number;
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
 *
 * S12b: também o detalhe das Estatísticas, em lotes. O dado diário (mapa de calor) e as horas dos
 * servidores duram 400 dias; as Sessões de jogo, que revelam horários de uma pessoa, 90. Os
 * agregados semanais e o radar de armas não expiram (as somas de sempre).
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
    const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const statsDaily = await this.sweepBatched(
      accountStatsDaily,
      lt(accountStatsDaily.day, dayOf(daysAgo(STATS_DAILY_RETENTION_DAYS))),
    );
    const sessions = await this.sweepBatched(
      playSessions,
      lt(playSessions.startedAt, daysAgo(PLAY_SESSION_RETENTION_DAYS)),
    );
    const hours = await this.sweepBatched(
      serverHours,
      lt(serverHours.hourStart, daysAgo(SERVER_HOURS_RETENTION_DAYS)),
    );
    const paymentLog = await this.sweepBatched(
      paymentEvents,
      lt(paymentEvents.receivedAt, daysAgo(PAYMENT_EVENT_RETENTION_DAYS)),
    );
    if (chat.length + old.length + events + statsDaily + sessions + hours + paymentLog > 0) {
      this.logger.log(
        `Limpeza de retenção: ${chat.length} mensagem(ns) de chat, ${old.length} Denúncia(s), ${events} ID(s) de evento, ${statsDaily} dia(s) de atividade, ${sessions} Sessão(ões) de jogo e ${hours} hora(s) de servidor apagados`,
      );
    }
    return {
      chatMessages: chat.length,
      reports: old.length,
      gameEvents: events,
      statsDaily,
      playSessions: sessions,
      serverHours: hours,
      paymentEvents: paymentLog,
    };
  }

  /**
   * Apaga as linhas de `table` que casam com `where`, `batchSize` por vez (pelo `ctid`, porque estas
   * tabelas têm chave composta), até acabar.
   */
  private async sweepBatched(table: PgTable, where: SQL): Promise<number> {
    let total = 0;
    for (;;) {
      const { rowCount } = await this.db.execute(
        sql`delete from ${table} where ctid = any(array(select ctid from ${table} where ${where} limit ${this.batchSize}))`,
      );
      total += rowCount ?? 0;
      if ((rowCount ?? 0) < this.batchSize) return total;
    }
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
