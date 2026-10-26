import './zod-jitless.js';
import { z } from 'zod';
import { gameModeSchema } from './game-server.js';
import { steamId64Schema } from './steam.js';

/**
 * Denúncias (`Report`, S13) e log de chat: o jogador denuncia outro com `!report` no jogo; a
 * Denúncia vai para a fila da Staff no painel e para o Discord. O chat de todos os servidores é
 * registrado para a moderação (ADR 0019).
 */

/** Motivo da Denúncia, no vocabulário do jogo (a Categoria de infração é escolhida pela Staff). */
export const REPORT_REASONS = ['cheat', 'voice', 'offensive_chat', 'griefing', 'other'] as const;

export const reportReasonSchema = z.enum(REPORT_REASONS).meta({ id: 'ReportReason' });

export type ReportReason = z.infer<typeof reportReasonSchema>;

/** Como o motivo aparece no jogo, no painel e no Discord. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  cheat: 'Cheat',
  voice: 'Voz ofensiva',
  offensive_chat: 'Chat ofensivo',
  griefing: 'Antijogo',
  other: 'Outro',
};

/**
 * Sem demo, a Denúncia de cheat ou de voz sozinha não gera Punição: a Staff só pune com evidência
 * adicional (testemunha ou link, ex.: um clipe enviado no Discord).
 */
export const REPORT_REASONS_NEEDING_EVIDENCE: readonly ReportReason[] = ['cheat', 'voice'];

/** Limites aplicados na API (S13). */
export const REPORT_SAME_TARGET_COOLDOWN_MINUTES = 10;
export const REPORT_HOURLY_LIMIT = 5;

/** Chat que acompanha a Denúncia: as últimas linhas do servidor, até esta idade. */
export const REPORT_CHAT_LINES = 20;
export const REPORT_CHAT_WINDOW_MINUTES = 5;

/** Retenção (job de limpeza da API): o chat 30 dias, a Denúncia 90 dias, os IDs de eventos 30 dias. */
export const CHAT_RETENTION_DAYS = 30;
export const GAME_EVENT_RETENTION_DAYS = 30;
export const REPORT_RETENTION_DAYS = 90;
/** S12b: o dado diário (mapa de calor) e o histórico por hora dos servidores 400 dias; as Sessões de jogo 90. */
export const STATS_DAILY_RETENTION_DAYS = 400;
export const SERVER_HOURS_RETENTION_DAYS = 400;
export const PLAY_SESSION_RETENTION_DAYS = 90;

/** Maior mensagem de chat guardada (o jogo já limita bem abaixo disto). */
export const CHAT_TEXT_MAX = 256;

/** Em que lado o jogador estava ao falar. */
export const chatTeamSchema = z.enum(['ct', 't', 'spectator']).meta({ id: 'ChatTeam' });

export type ChatTeam = z.infer<typeof chatTeamSchema>;

/**
 * Uma mensagem de chat, como o Servidor Carmine a viu (vai no lote de eventos, ADR 0018, com ID
 * próprio: reenviar não duplica). `teamChat` é o chat de time (`say_team`). O que o destinatário
 * escondeu com `!chat off` não muda nada aqui: o log é do que foi dito.
 */
export const chatMessageEventSchema = z
  .object({
    id: z.uuid(),
    at: z.iso.datetime({ offset: true }),
    steamId: steamId64Schema,
    team: chatTeamSchema,
    teamChat: z.boolean(),
    text: z.string().min(1).max(CHAT_TEXT_MAX),
  })
  .meta({ id: 'ChatMessageEvent' });

export type ChatMessageEvent = z.infer<typeof chatMessageEventSchema>;

/**
 * Corpo de `POST /api/server/reports`: o `!report` de um jogador. O servidor vem da chave; o
 * horário é o da API. `round` é o número do round em andamento (nulo se o plugin não sabe).
 */
export const createReportSchema = z
  .object({
    reporterSteamId: steamId64Schema,
    targetSteamId: steamId64Schema,
    reason: reportReasonSchema,
    // Nulo também vale ausente (o cliente C# omite o que é nulo): ver `killEventSchema`.
    round: z.int().nonnegative().nullable().default(null),
    map: z.string().max(64).nullable().default(null),
  })
  .meta({ id: 'CreateReport' });

export type CreateReport = z.infer<typeof createReportSchema>;

/** Por que a API recusou a Denúncia. */
export const REPORT_REFUSALS = [
  /** Denunciar a si mesmo. */
  'self',
  /** O alvo ou o denunciante não tem Conta (o jogador acabou de entrar, ou é bot). */
  'unknown_account',
  /** Já denunciou este jogador há pouco (1 a cada 10 minutos por alvo). */
  'same_target_cooldown',
  /** Já fez 5 Denúncias na última hora. */
  'hourly_limit',
] as const;

export const reportRefusalSchema = z.enum(REPORT_REFUSALS).meta({ id: 'ReportRefusal' });

export type ReportRefusal = z.infer<typeof reportRefusalSchema>;

/**
 * Resposta do `!report`: sempre 200, para o plugin só repassar o texto. Aceita: `accepted` e a
 * mensagem de confirmação. Recusada: `refusal`, a mensagem (que já diz quando tentar de novo) e
 * `retryAfterSeconds` nos limites.
 */
export const reportResultSchema = z
  .object({
    accepted: z.boolean(),
    message: z.string().min(1),
    refusal: reportRefusalSchema.nullable(),
    retryAfterSeconds: z.int().positive().nullable(),
  })
  .meta({ id: 'ReportResult' });

export type ReportResult = z.infer<typeof reportResultSchema>;

/** Confirmação mostrada ao denunciante. */
export const REPORT_RECEIVED_MESSAGE = 'Denúncia recebida; a Staff analisa em até 72 h.';

/** Uma linha do chat que a Denúncia guardou (cópia: sobrevive à limpeza dos 30 dias do chat). */
export const reportChatLineSchema = z
  .object({
    at: z.iso.datetime({ offset: true }),
    /** Nulo se a Conta da linha foi anonimizada depois. */
    publicId: z.int().positive().nullable(),
    displayName: z.string(),
    team: chatTeamSchema,
    teamChat: z.boolean(),
    text: z.string(),
    /** Foi o denunciado que falou. */
    fromTarget: z.boolean(),
  })
  .meta({ id: 'ReportChatLine' });

export type ReportChatLine = z.infer<typeof reportChatLineSchema>;

export const reportStatusSchema = z
  .enum(['open', 'archived', 'sanctioned'])
  .meta({ id: 'ReportStatus' });

export type ReportStatus = z.infer<typeof reportStatusSchema>;

const reportPersonSchema = z
  .object({
    publicId: z.int().positive(),
    displayName: z.string().min(1),
  })
  .meta({ id: 'ReportPerson' });

/** Uma Denúncia na fila da Staff (`GET /api/staff/reports`, permissão `reports.handle`). */
export const staffReportSchema = z
  .object({
    id: z.uuid(),
    status: reportStatusSchema,
    reason: reportReasonSchema,
    createdAt: z.iso.datetime({ offset: true }),
    target: reportPersonSchema,
    /** Nulo se o denunciante pediu a exclusão dos dados. */
    reporter: reportPersonSchema.nullable(),
    server: z
      .object({
        id: z.uuid(),
        name: z.string(),
        code: z.string().nullable(),
        mode: gameModeSchema,
      })
      .meta({ id: 'StaffReportServer' })
      .nullable(),
    map: z.string().nullable(),
    round: z.int().nonnegative().nullable(),
    chat: z.array(reportChatLineSchema),
    /** Outras Denúncias abertas contra o mesmo jogador (sem contar esta). */
    otherOpenAgainstTarget: z.int().nonnegative(),
    /** Cheat e voz: sem demo, só viram Punição com evidência adicional. */
    needsEvidence: z.boolean(),
    resolution: z
      .object({
        at: z.iso.datetime({ offset: true }),
        by: z
          .object({ publicId: z.int().positive().nullable(), displayName: z.string().nullable() })
          .meta({ id: 'StaffReportResolver' }),
        /** Motivo do arquivamento; nulo quando virou Punição. */
        reason: z.string().nullable(),
      })
      .meta({ id: 'StaffReportResolution' })
      .nullable(),
  })
  .meta({ id: 'StaffReport' });

export type StaffReport = z.infer<typeof staffReportSchema>;

export const STAFF_REPORTS_PAGE_DEFAULT = 30;
export const STAFF_REPORTS_PAGE_MAX = 100;

/**
 * `GET /api/staff/reports?status=&before=&limit=`: a fila. `status` padrão `open` (as mais
 * antigas primeiro, que vencem o prazo de 72 h antes); `archived` e `sanctioned` vêm das mais
 * recentes para as mais antigas. `before` é o `nextCursor` da página anterior.
 */
export const staffReportPageSchema = z
  .object({
    reports: z.array(staffReportSchema),
    nextCursor: z.string().nullable(),
    /** Quantas Denúncias abertas há no total (o selo do painel). */
    openCount: z.int().nonnegative(),
  })
  .meta({ id: 'StaffReportPage' });

export type StaffReportPage = z.infer<typeof staffReportPageSchema>;

/** Quanto tempo falta para tentar de novo, em texto curto ("3 min", "45 s"). */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} s`;
  return `${Math.ceil(seconds / 60)} min`;
}
