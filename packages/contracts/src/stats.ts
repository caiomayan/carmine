import { z } from 'zod';
import { gameModeSchema } from './game-server.js';
import { weekStartSchema } from './ranking.js';
import { chatMessageEventSchema } from './reports.js';
import { steamId64Schema } from './steam.js';

/** Quantos eventos cabem num lote (`POST /api/server/events`), somando todos os tipos. */
export const EVENT_BATCH_MAX_EVENTS = 500;

/** Maior dano de um evento `damage` (o plugin manda um evento por acerto). */
export const DAMAGE_EVENT_MAX = 500;

/** Uma Sessão de jogo acima disto é tratada como lixo (plugin que não viu a saída). */
export const PLAY_SESSION_MAX_SECONDS = 24 * 60 * 60;

/**
 * ID do evento, gerado no Servidor Carmine (UUID v7). É a chave da idempotência (ADR 0018): o
 * mesmo ID reenviado em outro lote não conta duas vezes.
 */
const eventIdSchema = z.uuid();

const eventTimeSchema = z.iso.datetime({ offset: true });

/** Time de um jogador num round. */
export const gameTeamSchema = z.enum(['ct', 't']).meta({ id: 'GameTeam' });

export type GameTeam = z.infer<typeof gameTeamSchema>;

/** Quem venceu o round; `none` é empate (ou round sem vencedor). */
export const roundWinnerSchema = z.enum(['ct', 't', 'none']).meta({ id: 'RoundWinner' });

export type RoundWinner = z.infer<typeof roundWinnerSchema>;

/**
 * Uma morte no servidor. Gera, conforme as regras da S12: kill (do assassino), morte (da vítima)
 * e assistência. `killerSteamId` nulo com `killerIsBot` falso é o mundo (queda, bomba): conta só
 * a morte, como no suicídio. Um bot como assassino ou vítima anula o evento para todos; um bot só
 * na assistência tira só a assistência. Kill em aliado (`teamKill`) não conta kill nem morte, mas
 * fica registrada para a moderação. Aquecimento (`warmup`) não conta.
 */
export const killEventSchema = z
  .object({
    id: eventIdSchema,
    at: eventTimeSchema,
    warmup: z.boolean(),
    killerSteamId: steamId64Schema.nullable(),
    killerIsBot: z.boolean(),
    victimSteamId: steamId64Schema.nullable(),
    victimIsBot: z.boolean(),
    assisterSteamId: steamId64Schema.nullable(),
    assisterIsBot: z.boolean(),
    headshot: z.boolean(),
    weapon: z.string().max(64),
    /** O assassino e a vítima são de times aliados (nunca no Deathmatch, todos contra todos). */
    teamKill: z.boolean(),
  })
  .meta({ id: 'KillEvent' });

export type KillEvent = z.infer<typeof killEventSchema>;

/** Dano de um acerto de um jogador em outro (o plugin manda um evento por acerto). */
export const damageEventSchema = z
  .object({
    id: eventIdSchema,
    at: eventTimeSchema,
    warmup: z.boolean(),
    attackerSteamId: steamId64Schema,
    /** Só o dano em inimigo conta: bot e aliado ficam de fora. */
    victimIsBot: z.boolean(),
    teamDamage: z.boolean(),
    amount: z.int().min(1).max(DAMAGE_EVENT_MAX),
  })
  .meta({ id: 'DamageEvent' });

export type DamageEvent = z.infer<typeof damageEventSchema>;

/** Um jogador de um round, com o time em que jogou. */
export const roundPlayerSchema = z
  .object({ steamId: steamId64Schema, team: gameTeamSchema })
  .meta({ id: 'RoundPlayer' });

export type RoundPlayer = z.infer<typeof roundPlayerSchema>;

/**
 * Fim de um round: quem venceu e quem jogou. `players` são os humanos que estavam no round, com
 * o time em que jogaram; quem saiu no meio continua na lista (round abandonado conta como jogado).
 */
export const roundEndEventSchema = z
  .object({
    id: eventIdSchema,
    at: eventTimeSchema,
    warmup: z.boolean(),
    winner: roundWinnerSchema,
    players: z.array(roundPlayerSchema).max(64),
  })
  .meta({ id: 'RoundEndEvent' });

export type RoundEndEvent = z.infer<typeof roundEndEventSchema>;

/** Um jogador entrou no servidor (o plugin gera o `sessionId`, UUID v7). */
export const sessionStartEventSchema = z
  .object({
    id: eventIdSchema,
    at: eventTimeSchema,
    sessionId: z.uuid(),
    steamId: steamId64Schema,
  })
  .meta({ id: 'SessionStartEvent' });

export type SessionStartEvent = z.infer<typeof sessionStartEventSchema>;

/**
 * O jogador saiu (ou o plugin foi descarregado). O tempo jogado entra nas Estatísticas aqui, de
 * `startedAt` a `at`; uma Sessão sem fim (queda do servidor) não soma tempo.
 */
export const sessionEndEventSchema = z
  .object({
    id: eventIdSchema,
    at: eventTimeSchema,
    sessionId: z.uuid(),
    steamId: steamId64Schema,
    startedAt: eventTimeSchema,
  })
  .meta({ id: 'SessionEndEvent' });

export type SessionEndEvent = z.infer<typeof sessionEndEventSchema>;

/** Quantos eventos há num lote, somando todos os tipos. */
export function countEvents(batch: {
  kills: readonly unknown[];
  damages: readonly unknown[];
  roundEnds: readonly unknown[];
  sessionStarts: readonly unknown[];
  sessionEnds: readonly unknown[];
  chatMessages?: readonly unknown[];
}): number {
  return (
    batch.kills.length +
    batch.damages.length +
    batch.roundEnds.length +
    batch.sessionStarts.length +
    batch.sessionEnds.length +
    (batch.chatMessages?.length ?? 0)
  );
}

/**
 * Corpo de `POST /api/server/events` (ADR 0018): um lote idempotente de eventos do jogo. A ordem
 * entre os tipos não importa. Reenviar o lote inteiro (ou parte dele, num lote novo) não duplica
 * nada: a API descarta os IDs que já viu.
 */
export const eventBatchSchema = z
  .object({
    kills: z.array(killEventSchema).max(EVENT_BATCH_MAX_EVENTS),
    damages: z.array(damageEventSchema).max(EVENT_BATCH_MAX_EVENTS),
    roundEnds: z.array(roundEndEventSchema).max(EVENT_BATCH_MAX_EVENTS),
    sessionStarts: z.array(sessionStartEventSchema).max(EVENT_BATCH_MAX_EVENTS),
    sessionEnds: z.array(sessionEndEventSchema).max(EVENT_BATCH_MAX_EVENTS),
    /** Chat dos servidores (S13): vai no mesmo lote e na mesma fila. Ausente: nenhuma. */
    chatMessages: z.array(chatMessageEventSchema).max(EVENT_BATCH_MAX_EVENTS).optional(),
  })
  .refine((batch) => countEvents(batch) <= EVENT_BATCH_MAX_EVENTS, {
    message: `no máximo ${EVENT_BATCH_MAX_EVENTS} eventos por lote`,
  })
  .meta({ id: 'EventBatch' });

export type EventBatch = z.infer<typeof eventBatchSchema>;

/**
 * Resposta do lote. `accepted` são os eventos novos, `duplicates` os IDs já vistos (reenvio) e
 * `ignored` os novos que não entram nas Estatísticas (bot, aquecimento, kill em aliado, Conta
 * desconhecida). `accepted + duplicates` é o tamanho do lote.
 */
export const eventBatchResultSchema = z
  .object({
    accepted: z.int().nonnegative(),
    duplicates: z.int().nonnegative(),
    ignored: z.int().nonnegative(),
  })
  .meta({ id: 'EventBatchResult' });

export type EventBatchResult = z.infer<typeof eventBatchResultSchema>;

/** Contagens de uma Conta (Perfil público), por Modo ou no total. */
const statsCountsShape = {
  kills: z.int().nonnegative(),
  deaths: z.int().nonnegative(),
  assists: z.int().nonnegative(),
  /** kills ÷ max(mortes, 1), 2 casas. */
  kd: z.number().nonnegative(),
  /** kills com headshot ÷ kills, em %, 1 casa; nulo sem kills. */
  headshotPercent: z.number().min(0).max(100).nullable(),
  secondsPlayed: z.int().nonnegative(),
};

/** Estatísticas de um Modo. `adr` só no Retake e `kpm` só no Deathmatch (nulos nos outros). */
export const modeStatsSchema = z
  .object({
    mode: gameModeSchema,
    ...statsCountsShape,
    /** Dano em inimigos ÷ rounds jogados, 1 casa; só no Retake e com ao menos 1 round. */
    adr: z.number().nonnegative().nullable(),
    /** Kills ÷ minutos jogados, 2 casas; só no Deathmatch e com tempo jogado. */
    kpm: z.number().nonnegative().nullable(),
  })
  .meta({ id: 'ModeStats' });

export type ModeStats = z.infer<typeof modeStatsSchema>;

/** O total de todos os Modos: ADR e KPM não se somam entre Modos, então não existem aqui. */
export const totalStatsSchema = z.object(statsCountsShape).meta({ id: 'TotalStats' });

export type TotalStats = z.infer<typeof totalStatsSchema>;

/**
 * `GET /api/profiles/{publicId}/stats`: as Estatísticas de sempre da Conta. Num Perfil privado
 * (S11), só a própria Conta as vê; para os outros `visible` é falso e não há números.
 */
export const profileStatsSchema = z
  .object({
    visible: z.boolean(),
    total: totalStatsSchema.nullable(),
    modes: z.array(modeStatsSchema),
  })
  .meta({ id: 'ProfileStats' });

export type ProfileStats = z.infer<typeof profileStatsSchema>;

/** Quantas semanas a série do Perfil cobre: a atual e as 7 anteriores. */
export const PROFILE_SERIES_WEEKS = 8;

/** Contagens de uma semana (por Modo ou somadas). `rounds` são os rounds jogados. */
const weekCountsShape = {
  rounds: z.int().nonnegative(),
  kills: z.int().nonnegative(),
  deaths: z.int().nonnegative(),
  /** kills ÷ max(mortes, 1), 2 casas. */
  kd: z.number().nonnegative(),
  /** kills com headshot ÷ kills, em %, 1 casa; nulo sem kills na semana. */
  headshotPercent: z.number().min(0).max(100).nullable(),
  secondsPlayed: z.int().nonnegative(),
};

/** Uma semana de um Modo. */
export const modeWeekStatsSchema = z
  .object({ mode: gameModeSchema, ...weekCountsShape })
  .meta({ id: 'ModeWeekStats' });

export type ModeWeekStats = z.infer<typeof modeWeekStatsSchema>;

/**
 * Uma semana da série: os números somados e os de cada Modo (sempre os dois, na ordem Retake e
 * Deathmatch; um Modo sem atividade na semana vem com zeros).
 */
export const weekStatsSchema = z
  .object({
    weekStart: weekStartSchema,
    ...weekCountsShape,
    modes: z.array(modeWeekStatsSchema),
  })
  .meta({ id: 'WeekStats' });

export type WeekStats = z.infer<typeof weekStatsSchema>;

/** Tempo jogado num Modo, em segundos (o cliente mostra em horas). */
export const modeSecondsSchema = z
  .object({ mode: gameModeSchema, secondsPlayed: z.int().nonnegative() })
  .meta({ id: 'ModeSeconds' });

export type ModeSeconds = z.infer<typeof modeSecondsSchema>;

/** O tempo jogado por Modo (os dois, na ordem Retake e Deathmatch) na semana atual e no total. */
export const profileHoursSchema = z
  .object({
    week: z.array(modeSecondsSchema),
    total: z.array(modeSecondsSchema),
  })
  .meta({ id: 'ProfileHours' });

export type ProfileHours = z.infer<typeof profileHoursSchema>;

/**
 * `GET /api/profiles/{publicId}/stats/weekly`: a série semanal do Perfil (V3). `weeks` traz as
 * últimas `PROFILE_SERIES_WEEKS` semanas, da mais antiga à atual, com zeros nas sem
 * atividade; `hours` o tempo por Modo na semana atual e desde sempre. `firstWeek` é a primeira
 * semana com atividade (para "coletando desde"), ou nulo sem nenhuma. Só existe o que o agregado
 * semanal guarda: nada por dia nem por arma. Num Perfil privado (S11), só a própria Conta vê:
 * para os outros `visible` é falso, `weeks` vem vazia e o resto, nulo.
 */
export const profileSeriesSchema = z
  .object({
    visible: z.boolean(),
    weeks: z.array(weekStatsSchema),
    hours: profileHoursSchema.nullable(),
    firstWeek: weekStartSchema.nullable(),
  })
  .meta({ id: 'ProfileSeries' });

export type ProfileSeries = z.infer<typeof profileSeriesSchema>;

/**
 * Os números de uma semana, de todas as Contas somadas (a faixa "Esta semana" da home). `players`
 * são as Contas que jogaram na semana; as outras são somas de `account_stats_weekly`. Não há
 * "rounds": a soma por jogador contaria o mesmo round uma vez para cada um que estava nele.
 */
export const weekTotalsSchema = z
  .object({
    players: z.int().nonnegative(),
    kills: z.int().nonnegative(),
    headshots: z.int().nonnegative(),
    secondsPlayed: z.int().nonnegative(),
  })
  .meta({ id: 'WeekTotals' });

export type WeekTotals = z.infer<typeof weekTotalsSchema>;

/**
 * `GET /api/stats/week`: os números da semana atual do Ranking e, para comparar, os da anterior
 * (nulos quando a semana anterior não teve nenhum jogo). Público e sem identificar ninguém.
 */
export const weekSummarySchema = z
  .object({
    weekStart: weekStartSchema,
    /** Domingo da semana, `YYYY-MM-DD`. */
    weekEnd: weekStartSchema,
    current: weekTotalsSchema,
    previous: weekTotalsSchema.nullable(),
  })
  .meta({ id: 'WeekSummary' });

export type WeekSummary = z.infer<typeof weekSummarySchema>;
