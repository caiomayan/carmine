import {
  type CreateReport,
  type GameMode,
  REPORT_CHAT_LINES,
  REPORT_CHAT_WINDOW_MINUTES,
  REPORT_RECEIVED_MESSAGE,
  type ReportReason,
  type ReportRefusal,
  type ReportResult,
} from '@carmine/contracts';
import { and, desc, eq, gt, gte, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, chatMessages, type ReportChatLineRow, reports } from '../database/schema.js';
import { checkReportLimits, refusalMessage } from './report-limits.js';

/** O Servidor Carmine que mandou a Denúncia (autenticado pela chave). */
export interface ReportServer {
  id: string;
  name: string;
  code: string | null;
  mode: GameMode;
}

/** O que o aviso no Discord precisa saber de uma Denúncia nova. */
export interface CreatedReport {
  id: string;
  reason: ReportReason;
  target: { publicId: number; displayName: string };
  server: ReportServer;
}

export interface ReportOutcome {
  result: ReportResult;
  /** Preenchido só quando a Denúncia foi aceita. */
  created: CreatedReport | null;
}

function refused(refusal: ReportRefusal, retryAfterSeconds: number | null = null): ReportOutcome {
  return {
    result: {
      accepted: false,
      message: refusalMessage(refusal, retryAfterSeconds),
      refusal,
      retryAfterSeconds,
    },
    created: null,
  };
}

/**
 * Recebe a Denúncia do jogo (S13): confere denunciante e alvo, aplica os limites (1 por alvo a
 * cada 10 minutos, 5 por hora) e guarda a Denúncia com uma cópia das últimas linhas do chat do
 * servidor. Os limites valem dentro de uma transação que trava o denunciante, então duas
 * Denúncias ao mesmo tempo não passam juntas.
 */
export class Reports {
  constructor(private readonly db: Database) {}

  async create(
    server: ReportServer,
    input: CreateReport,
    now = new Date(),
  ): Promise<ReportOutcome> {
    if (input.reporterSteamId === input.targetSteamId) return refused('self');

    return this.db.transaction(async (tx) => {
      const [reporter, target] = await Promise.all(
        [input.reporterSteamId, input.targetSteamId].map(async (steamId) => {
          const [row] = await tx
            .select({
              id: accounts.id,
              publicId: accounts.publicId,
              displayName: accounts.displayName,
            })
            .from(accounts)
            .where(and(eq(accounts.steamId, BigInt(steamId)), isNull(accounts.anonymizedAt)));
          return row;
        }),
      );
      if (!reporter || !target) return refused('unknown_account');

      // Um denunciante por vez: sem isto, duas Denúncias simultâneas leriam o mesmo histórico.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${reporter.id}, 13))`);

      const past = await tx
        .select({ targetAccountId: reports.targetAccountId, createdAt: reports.createdAt })
        .from(reports)
        .where(
          and(
            eq(reports.reporterAccountId, reporter.id),
            gt(reports.createdAt, new Date(now.getTime() - 60 * 60_000)),
          ),
        );
      const verdict = checkReportLimits(past, target.id, now);
      if (!verdict.allowed) return refused(verdict.refusal, verdict.retryAfterSeconds);

      const lines = await tx
        .select({
          at: chatMessages.at,
          accountId: chatMessages.accountId,
          publicId: accounts.publicId,
          displayName: accounts.displayName,
          team: chatMessages.team,
          teamChat: chatMessages.teamChat,
          text: chatMessages.text,
        })
        .from(chatMessages)
        .innerJoin(accounts, eq(accounts.id, chatMessages.accountId))
        .where(
          and(
            eq(chatMessages.serverId, server.id),
            gte(chatMessages.at, new Date(now.getTime() - REPORT_CHAT_WINDOW_MINUTES * 60_000)),
            lte(chatMessages.at, now),
          ),
        )
        .orderBy(desc(chatMessages.at))
        .limit(REPORT_CHAT_LINES);
      const chatContext: ReportChatLineRow[] = lines.reverse().map((line) => ({
        at: line.at.toISOString(),
        publicId: line.publicId,
        displayName: line.displayName,
        team: line.team,
        teamChat: line.teamChat,
        text: line.text,
        fromTarget: line.accountId === target.id,
      }));

      const [created] = await tx
        .insert(reports)
        .values({
          reporterAccountId: reporter.id,
          targetAccountId: target.id,
          serverId: server.id,
          map: input.map,
          round: input.round,
          reason: input.reason,
          chatContext,
          createdAt: now,
        })
        .returning({ id: reports.id });
      return {
        result: {
          accepted: true,
          message: REPORT_RECEIVED_MESSAGE,
          refusal: null,
          retryAfterSeconds: null,
        },
        created: {
          id: (created as { id: string }).id,
          reason: input.reason,
          target: { publicId: target.publicId, displayName: target.displayName },
          server,
        },
      };
    });
  }
}
