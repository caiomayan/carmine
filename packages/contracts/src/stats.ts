import './zod-jitless.js';
import { z } from 'zod';
import { gameModeSchema, mapNameSchema } from './game-server.js';
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

/**
 * S17 (coleta por round): o que todo evento de round pode levar a mais. Tudo opcional, para a API
 * seguir aceitando o plugin que ainda não manda. `mapPlayId` (UUID v7, criado pelo `MatchTracker` a
 * cada mapa novo ou reinício de partida) agrupa os rounds de um mapa jogado e não aparece para
 * ninguém. `atMs` é o horário do servidor em milissegundos desde 1970, mais exato que `at` para a
 * ordem das kills dentro do round (trade, clutch).
 */
const roundContextShape = {
  mapPlayId: z.uuid().optional(),
  roundNumber: z.int().positive().max(999).optional(),
  atMs: z.int().nonnegative().optional(),
};

/** Posição no mapa, em unidades do jogo. */
export const positionSchema = z
  .object({
    x: z.number().min(-100_000).max(100_000),
    y: z.number().min(-100_000).max(100_000),
    z: z.number().min(-100_000).max(100_000),
  })
  .meta({ id: 'Position' });

export type Position = z.infer<typeof positionSchema>;

/** Quem venceu o round; `none` é empate (ou round sem vencedor). */
export const roundWinnerSchema = z.enum(['ct', 't', 'none']).meta({ id: 'RoundWinner' });

export type RoundWinner = z.infer<typeof roundWinnerSchema>;

/** Como um round acabou (S17): bomba explodiu, bomba desarmada, eliminação, tempo ou outro. */
export const roundEndReasonSchema = z
  .enum(['bomb_exploded', 'bomb_defused', 'elimination', 'time', 'other'])
  .meta({ id: 'RoundEndReason' });

export type RoundEndReason = z.infer<typeof roundEndReasonSchema>;

/**
 * Os campos nulos (SteamID do assassino, da vítima e do assistente) também valem AUSENTES: o cliente
 * C# do plugin, gerado do OpenAPI, deixa fora do JSON o que é nulo (`WhenWritingNull`), então uma kill
 * sem assistente chegava sem `assisterSteamId` e o lote inteiro era recusado (400). `default(null)` os
 * normaliza: o resto da API só vê `null`.
 *
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
    killerSteamId: steamId64Schema.nullable().default(null),
    killerIsBot: z.boolean(),
    victimSteamId: steamId64Schema.nullable().default(null),
    victimIsBot: z.boolean(),
    assisterSteamId: steamId64Schema.nullable().default(null),
    assisterIsBot: z.boolean(),
    headshot: z.boolean(),
    weapon: z.string().max(64),
    /** O assassino e a vítima são de times aliados (nunca no Deathmatch, todos contra todos). */
    teamKill: z.boolean(),
    /**
     * S12b: o lado do assassino na hora da morte, para o radar de armas por lado. Opcional: plugin
     * antigo não manda, e então a kill conta nas Estatísticas mas não entra no radar. Nulo (ou
     * ausente) quando o assassino é o mundo, um bot ou não tem lado.
     */
    killerTeam: gameTeamSchema.nullable().optional(),
    ...roundContextShape,
    /** S17: o lado da vítima na hora da morte; nulo (ou ausente) quando não tem lado. */
    victimTeam: gameTeamSchema.nullable().optional(),
    /** S17: a assistência veio de uma flash (`assistedflash`). */
    flashAssist: z.boolean().optional(),
    /** S17: quantas superfícies o tiro atravessou (`penetrated`); acima de 0 é wallbang. */
    penetrated: z.int().nonnegative().max(16).optional(),
    /** S17: o tiro atravessou fumaça (`thrusmoke`). */
    throughSmoke: z.boolean().optional(),
    /** S17: o assassino estava cego por flash (`attackerblind`). */
    attackerBlind: z.boolean().optional(),
    /** S17: sniper sem mira (`noscope`). */
    noScope: z.boolean().optional(),
    /** S17: distância entre os dois, em unidades do jogo. */
    distance: z.number().nonnegative().max(100_000).optional(),
    killerPosition: positionSchema.nullable().optional(),
    victimPosition: positionSchema.nullable().optional(),
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
    /** O valor bruto do acerto: as somas de hoje (ADR 0018) continuam usando este. */
    amount: z.int().min(1).max(DAMAGE_EVENT_MAX),
    ...roundContextShape,
    /** S17: quem levou o dano. Nulo (ou ausente) quando não é um humano com Conta possível. */
    victimSteamId: steamId64Schema.nullable().optional(),
    weapon: z.string().max(64).optional(),
    /** S17: a parte do corpo do acerto (`hitgroup` do jogo: 1 cabeça, 2 peito, 3 barriga...). */
    hitgroup: z.int().min(0).max(10).optional(),
    /** S17: o dano que a armadura absorveu. */
    armorDamage: z.int().min(0).max(DAMAGE_EVENT_MAX).optional(),
    /** S17: o dano limitado à vida que a vítima tinha antes do hit (é o que entra no ADR do rating). */
    healthDamage: z.int().min(0).max(DAMAGE_EVENT_MAX).optional(),
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
    /**
     * S12b (todos opcionais; o Deathmatch pode nem ter `round_end`): o mapa do round, o número dele
     * no mapa (1 = primeiro) e o placar de times DEPOIS do round. O placar final do mapa é o do
     * último round dele; o histórico do servidor agrupa por mapa e hora.
     */
    map: mapNameSchema.optional(),
    roundNumber: z.int().positive().max(999).optional(),
    scoreCt: z.int().nonnegative().max(999).optional(),
    scoreT: z.int().nonnegative().max(999).optional(),
    /** S17: `roundNumber` acima já existe; o resto do contexto é o mapa jogado e o horário em ms. */
    mapPlayId: roundContextShape.mapPlayId,
    atMs: roundContextShape.atMs,
    /** S17: como o round acabou. `other` cobre o que o plugin não sabe classificar. */
    reason: roundEndReasonSchema.optional(),
    /** S17: da abertura do round (fim do freeze) até o fim, em milissegundos. */
    durationMs: z.int().nonnegative().max(3_600_000).optional(),
    /** S17: os humanos vivos no fim do round (a verdade sobre quem sobreviveu). */
    alive: z.array(steamId64Schema).max(64).optional(),
  })
  .meta({ id: 'RoundEndEvent' });

export type RoundEndEvent = z.infer<typeof roundEndEventSchema>;

/** Um jogador na abertura de um round: o lado e o valor do equipamento no fim do freeze. */
export const roundStartPlayerSchema = z
  .object({
    steamId: steamId64Schema,
    team: gameTeamSchema,
    /** `FreezetimeEndEquipmentValue`, em dólares do jogo. */
    equipmentValue: z.int().nonnegative().max(100_000),
  })
  .meta({ id: 'RoundStartPlayer' });

export type RoundStartPlayer = z.infer<typeof roundStartPlayerSchema>;

/**
 * Início de um round (fim do freeze, S17). `players` são os humanos; os bots só entram na conta
 * de quantos há em cada lado (`botsCt`, `botsT`), para a API saber quantos estavam vivos num clutch.
 * Um round sem humanos nos dois lados (os rounds sintéticos do `cs2-retakes`) não gera resumo.
 */
export const roundStartEventSchema = z
  .object({
    id: eventIdSchema,
    at: eventTimeSchema,
    atMs: roundContextShape.atMs,
    warmup: z.boolean(),
    mapPlayId: z.uuid(),
    roundNumber: z.int().positive().max(999),
    map: mapNameSchema.optional(),
    players: z.array(roundStartPlayerSchema).max(64),
    botsCt: z.int().nonnegative().max(64).default(0),
    botsT: z.int().nonnegative().max(64).default(0),
  })
  .meta({ id: 'RoundStartEvent' });

export type RoundStartEvent = z.infer<typeof roundStartEventSchema>;

/** A bomba foi plantada, desarmada ou explodiu. */
export const bombEventKindSchema = z
  .enum(['plant', 'defuse', 'explode'])
  .meta({ id: 'BombEventKind' });

export type BombEventKind = z.infer<typeof bombEventKindSchema>;

/** Um bomb site. */
export const bombSiteSchema = z.enum(['a', 'b']).meta({ id: 'BombSite' });

export type BombSite = z.infer<typeof bombSiteSchema>;

/** Bomba (S17). `steamId` é quem plantou ou desarmou; a explosão não tem autor. */
export const bombEventSchema = z
  .object({
    id: eventIdSchema,
    at: eventTimeSchema,
    atMs: roundContextShape.atMs,
    warmup: z.boolean(),
    mapPlayId: z.uuid(),
    roundNumber: z.int().positive().max(999),
    kind: bombEventKindSchema,
    steamId: steamId64Schema.nullable().optional(),
    site: bombSiteSchema.nullable().optional(),
  })
  .meta({ id: 'BombEvent' });

export type BombEvent = z.infer<typeof bombEventSchema>;

/** Um jogador entrou no servidor (o plugin gera o `sessionId`, UUID v7). */
export const sessionStartEventSchema = z
  .object({
    id: eventIdSchema,
    at: eventTimeSchema,
    sessionId: z.uuid(),
    steamId: steamId64Schema,
    /** S12b: o mapa em que a pessoa entrou. Opcional (plugin antigo). */
    map: mapNameSchema.optional(),
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
    /**
     * S12b: os mapas distintos por onde a Sessão passou, em ordem (no máximo 8): o Deathmatch
     * rotaciona o mapa com a pessoa dentro. Opcional (plugin antigo).
     */
    maps: z.array(mapNameSchema).max(8).optional(),
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
  roundStarts?: readonly unknown[];
  bombs?: readonly unknown[];
}): number {
  return (
    batch.kills.length +
    batch.damages.length +
    batch.roundEnds.length +
    batch.sessionStarts.length +
    batch.sessionEnds.length +
    (batch.chatMessages?.length ?? 0) +
    (batch.roundStarts?.length ?? 0) +
    (batch.bombs?.length ?? 0)
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
    /** Coleta por round (S17): início do round e bomba. Ausentes: o plugin ainda não manda. */
    roundStarts: z.array(roundStartEventSchema).max(EVENT_BATCH_MAX_EVENTS).optional(),
    bombs: z.array(bombEventSchema).max(EVENT_BATCH_MAX_EVENTS).optional(),
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
    /**
     * Pontuação DM dos últimos 90 dias (S21, ADR 0030), 1 casa; só no Deathmatch. Nula enquanto a
     * Conta não tem o mínimo de minutos do Ranking do DM na janela, ou a população é pequena demais.
     */
    dmScore: z.number().nonnegative().nullable().optional(),
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
