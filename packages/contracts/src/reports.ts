import './zod-jitless.js';
import { z } from 'zod';
import { AVATAR_REVIEW_DEADLINE_HOURS } from './avatar-rules.js';
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
/**
 * Teto por dia (dia de Brasília, ADR 0018) por Conta, somando todos os tipos de Denúncia (regra única de denúncia,
 * ADR 0027). O texto é o mesmo no jogo e no site, sem prefixo: no jogo o plugin põe o `Carmine · ` (`ChatMessage.Format`).
 */
export const REPORT_DAILY_LIMIT = 10;
export const REPORT_DAILY_LIMIT_MESSAGE = `Você já enviou ${REPORT_DAILY_LIMIT} denúncias hoje. Tente amanhã.`;

/**
 * Os tipos de Denúncia que a regra única cobre: de jogo (`!report`), de chat (cada mensagem das Salas), de foto de
 * perfil e de logo (Time e Sala). Hoje existem a de jogo e a de foto; as outras entram com as suas fatias.
 */
export const REPORT_KINDS = ['game', 'chat', 'avatar', 'logo'] as const;

export const reportKindSchema = z.enum(REPORT_KINDS).meta({ id: 'ReportKind' });

export type ReportKind = z.infer<typeof reportKindSchema>;

/** O prazo da Staff por tipo, em horas: foto e logo 24 h, jogo e chat 72 h (ADR 0019 e 0022). */
export const REPORT_REVIEW_DEADLINE_HOURS: Record<ReportKind, number> = {
  game: 72,
  chat: 72,
  avatar: AVATAR_REVIEW_DEADLINE_HOURS,
  logo: AVATAR_REVIEW_DEADLINE_HOURS,
};

/**
 * Quem denuncia muito o que a Staff arquiva perde peso: com pelo menos `REPORTER_ARCHIVED_MIN` Denúncias arquivadas
 * sem Punição nos últimos `REPORTER_WINDOW_DAYS` dias (de qualquer tipo) e mais arquivadas do que confirmadas, as
 * Denúncias da Conta vão para o fim da fila e não têm prazo correndo.
 */
export const REPORTER_ARCHIVED_MIN = 3;
export const REPORTER_WINDOW_DAYS = 90;

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
/** S17 (ADR 0024): os eventos brutos de round ficam 12 meses (uma partição por mês); os resumos, para sempre. */
export const ROUND_EVENT_RETENTION_MONTHS = 12;
/** S14: os webhooks de pagamento recebidos ficam 12 meses (o pagamento em si, 5 anos, por lei). */
export const PAYMENT_EVENT_RETENTION_DAYS = 365;

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
    // O Mapa jogado em andamento (S17), para agrupar na fila; o plugin que ainda não o manda deixa nulo.
    mapPlayId: z.uuid().nullable().default(null),
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
  /** Já fez `REPORT_DAILY_LIMIT` Denúncias hoje (todos os tipos). */
  'daily_limit',
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

/** Uma das Denúncias que formam um caso da fila (a Staff decide o caso, e a decisão vale para todas). */
export const staffReportMemberSchema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
    /** Nulo se o denunciante pediu a exclusão dos dados. */
    reporter: reportPersonSchema.nullable(),
    round: z.int().nonnegative().nullable(),
    /** O denunciante perdeu peso (ver `REPORTER_ARCHIVED_MIN`); só vale para as abertas. */
    lowWeight: z.boolean(),
  })
  .meta({ id: 'StaffReportMember' });

export type StaffReportMember = z.infer<typeof staffReportMemberSchema>;

/**
 * Um caso da fila da Staff (`GET /api/staff/reports`, permissão `reports.handle`): as Denúncias contra a mesma
 * Conta, pelo mesmo motivo, no mesmo Mapa jogado viram um item só (regra única de denúncia, ADR 0027). `id` é o da
 * mais antiga e serve para arquivar ou punir; a decisão vale para todas as do caso.
 */
export const staffReportSchema = z
  .object({
    id: z.uuid(),
    kind: reportKindSchema,
    status: reportStatusSchema,
    reason: reportReasonSchema,
    /** A mais antiga do caso. */
    createdAt: z.iso.datetime({ offset: true }),
    /** Quantas Denúncias o caso reúne (o painel mostra `4 denúncias` quando passa de 1). */
    count: z.int().positive(),
    /** As Denúncias do caso, da mais antiga para a mais nova. */
    members: z.array(staffReportMemberSchema).min(1),
    /**
     * Quando vence o prazo da Staff (`REPORT_REVIEW_DEADLINE_HOURS`), contado da Denúncia mais antiga de quem tem peso
     * normal. Nulo quando o caso já foi decidido ou quando todas as Denúncias abertas são de quem perdeu peso (sem
     * prazo correndo: não ficam vermelhas nem contam como atrasadas).
     */
    deadlineAt: z.iso.datetime({ offset: true }).nullable(),
    /** Todas as Denúncias abertas do caso são de quem perdeu peso: o caso vai para o fim da fila. */
    lowWeight: z.boolean(),
    target: reportPersonSchema,
    /** O denunciante da mais antiga; nulo se pediu a exclusão dos dados. Os outros estão em `members`. */
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
    /** O chat guardado pelas Denúncias do caso, juntos e sem repetir a mesma linha, em ordem de horário. */
    chat: z.array(reportChatLineSchema),
    /** Outras Denúncias abertas contra o mesmo jogador, fora deste caso. */
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
 * `GET /api/staff/reports?status=&before=&limit=`: a fila, de casos. `status` padrão `open` (os mais
 * antigos primeiro, que vencem o prazo de 72 h antes, e no fim os de quem perdeu peso); `archived` e
 * `sanctioned` vêm dos mais recentes para os mais antigos. `before` é o `nextCursor` da página anterior.
 */
export const staffReportPageSchema = z
  .object({
    reports: z.array(staffReportSchema),
    nextCursor: z.string().nullable(),
    /** Quantos casos abertos há no total (o selo do painel). */
    openCount: z.int().nonnegative(),
  })
  .meta({ id: 'StaffReportPage' });

export type StaffReportPage = z.infer<typeof staffReportPageSchema>;

/** Quanto tempo falta para tentar de novo, em texto curto ("3 min", "45 s"). */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} s`;
  return `${Math.ceil(seconds / 60)} min`;
}
