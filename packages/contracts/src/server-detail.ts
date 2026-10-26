import { z } from 'zod';
import { gameModeSchema, mapNameSchema } from './game-server.js';
import { liveServerStateSchema, matchStateSchema } from './live-servers.js';
import { rankingPlayerSchema } from './ranking.js';
import { gameTeamSchema } from './stats.js';
import { calendarDaySchema } from './stats-detail.js';

/**
 * S12b · A página do servidor (docs/specs/s12b-contratos.md). O placar de times ao vivo não tem
 * endpoint: vem em `LiveServer.match`, pela lista (`GET /api/servers` e o SSE). Aqui ficam os
 * jogadores de agora e o histórico do dia.
 *
 * O Deathmatch não tem placar de times e pode nem ter `round_end`: tudo o que depende de round é
 * opcional/nulo nesse Modo, e o cliente não deve mostrar zeros no lugar (nada de número inventado).
 */

/**
 * Um jogador no servidor agora (D2/D3). A identidade segue a regra do Ranking: Perfil privado vem como
 * "Jogador privado", sem `publicId` nem avatar (sem link), e conta como uma linha. `team`, `kills`,
 * `deaths` e `score` são nulos quando o servidor não mandou o placar por jogador (plugin antigo); no
 * Deathmatch `team` é nulo e os números existem.
 */
export const serverPlayerSchema = z
  .object({
    player: rankingPlayerSchema,
    team: gameTeamSchema.nullable(),
    kills: z.int().nonnegative().nullable(),
    deaths: z.int().nonnegative().nullable(),
    score: z.int().nullable(),
    /** É a linha de quem pede (só para quem está logado; nunca identifica outra pessoa). */
    self: z.boolean(),
  })
  .meta({ id: 'ServerPlayer' });

export type ServerPlayer = z.infer<typeof serverPlayerSchema>;

/**
 * `GET /api/servers/{id}/players`: quem está no servidor agora, uma linha por jogador (inclusive os
 * privados). Ordem: pontos (maior primeiro), depois kills, depois nome; sem placar por jogador, só
 * por nome. Offline: `players` vazio. `scoreboard` diz se o servidor mandou o placar por jogador.
 * `updatedAt` é o último batimento (nulo se nunca houve).
 */
export const serverPlayersSchema = z
  .object({
    serverId: z.uuid(),
    mode: gameModeSchema,
    state: liveServerStateSchema,
    map: mapNameSchema.nullable(),
    maxPlayers: z.int().min(1),
    match: matchStateSchema.nullable().optional(),
    scoreboard: z.boolean(),
    updatedAt: z.iso.datetime({ offset: true }).nullable(),
    players: z.array(serverPlayerSchema).max(128),
  })
  .meta({ id: 'ServerPlayers' });

export type ServerPlayers = z.infer<typeof serverPlayersSchema>;

/** Até quantos dias atrás `GET /api/servers/{id}/today?date=` responde (além de hoje). */
export const SERVER_TODAY_MAX_DAYS_BACK = 7;

/** Rounds de um dia (ou de um mapa): empates (`none`) são `played − ctWins − tWins`. */
export const serverRoundsSchema = z
  .object({
    played: z.int().nonnegative(),
    ctWins: z.int().nonnegative(),
    tWins: z.int().nonnegative(),
  })
  .meta({ id: 'ServerRounds' });

export type ServerRounds = z.infer<typeof serverRoundsSchema>;

/** O placar final de um mapa (o do último round dele). */
export const serverFinalScoreSchema = z
  .object({ ct: z.int().nonnegative(), t: z.int().nonnegative() })
  .meta({ id: 'ServerFinalScore' });

export type ServerFinalScore = z.infer<typeof serverFinalScoreSchema>;

/**
 * Um mapa jogado no dia, do primeiro ao último movimento dele (`from`, `to`). Com rounds (Retake):
 * `rounds`, `ctWins`, `tWins` e `finalScore` (este nulo se o plugin não mandou o placar). Sem rounds
 * (Deathmatch, ou plugin antigo): os quatro são nulos e o mapa vem das Sessões.
 */
export const serverTodayMapSchema = z
  .object({
    map: mapNameSchema,
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    rounds: z.int().nonnegative().nullable(),
    ctWins: z.int().nonnegative().nullable(),
    tWins: z.int().nonnegative().nullable(),
    finalScore: serverFinalScoreSchema.nullable(),
  })
  .meta({ id: 'ServerTodayMap' });

export type ServerTodayMap = z.infer<typeof serverTodayMapSchema>;

/**
 * Uma hora do dia (0 a 23, Brasília). `rounds` são os rounds jogados na hora (zero no Deathmatch);
 * `players` os jogadores distintos com Sessão naquela hora (o que o Deathmatch mostra no lugar).
 */
export const serverTodayHourSchema = z
  .object({
    hour: z.int().min(0).max(23),
    rounds: z.int().nonnegative(),
    players: z.int().nonnegative(),
  })
  .meta({ id: 'ServerTodayHour' });

export type ServerTodayHour = z.infer<typeof serverTodayHourSchema>;

export const serverPeakSchema = z
  .object({ at: z.iso.datetime({ offset: true }), count: z.int().positive() })
  .meta({ id: 'ServerPeak' });

export type ServerPeak = z.infer<typeof serverPeakSchema>;

/**
 * `GET /api/servers/{id}/today?date=YYYY-MM-DD` (padrão: hoje em Brasília; até
 * {@link SERVER_TODAY_MAX_DAYS_BACK} dias atrás; 400 fora disso): o histórico do dia do servidor.
 * - `rounds`: o dia somado; nulo no Deathmatch e num servidor que ainda não tem dado detalhado
 *   (`since` nulo): sem coleta não é zero rounds;
 * - `maps`: do mais cedo ao mais tarde;
 * - `hours`: sempre as 24 horas (0 a 23), com zeros;
 * - `peakPlayers`: o pico de jogadores ao mesmo tempo no dia; nulo sem Sessões;
 * - `uniquePlayers`: jogadores distintos no dia; nulo sem Sessões;
 * - `since`: desde quando o servidor tem dado detalhado ("coletando desde"); nulo se nunca teve.
 * Cache de ~15 s no servidor; `generatedAt` é quando foi montado.
 */
export const serverTodaySchema = z
  .object({
    serverId: z.uuid(),
    mode: gameModeSchema,
    date: calendarDaySchema,
    isToday: z.boolean(),
    since: calendarDaySchema.nullable(),
    rounds: serverRoundsSchema.nullable(),
    maps: z.array(serverTodayMapSchema),
    hours: z.array(serverTodayHourSchema).length(24),
    peakPlayers: serverPeakSchema.nullable(),
    uniquePlayers: z.int().nonnegative().nullable(),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'ServerToday' });

export type ServerToday = z.infer<typeof serverTodaySchema>;
