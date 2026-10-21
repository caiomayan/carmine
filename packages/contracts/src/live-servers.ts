import { z } from 'zod';
import { gameModeSchema } from './game-server.js';
import { gameSanctionSchema } from './moderation.js';
import { steamId64Schema } from './steam.js';

/**
 * Contratos da S06: o batimento do Carmine.Core, a lista pública de Servidores Carmine ao vivo
 * e o bloco "Seus amigos jogando agora".
 */

/** Cada quantos segundos o Carmine.Core manda o batimento (e logo depois de um connect/disconnect). */
export const HEARTBEAT_INTERVAL_SECONDS = 10;

/** Sem batimento por esse tempo, o Servidor Carmine fica offline. */
export const SERVER_OFFLINE_AFTER_SECONDS = 45;

/**
 * Corpo de `POST /api/server/heartbeat`: o estado atual do servidor, inteiro (não um delta),
 * então um batimento perdido não deixa nada para trás e não há fila a reenviar.
 * `players` são só os jogadores humanos conectados (sem bots nem a HLTV). `maxPlayers` são as
 * vagas públicas: no Retake, as do cs2-retakes (9), não o `maxplayers` do servidor, que inclui
 * a folga da Vaga reservada.
 */
export const serverHeartbeatSchema = z
  .object({
    map: z.string().trim().min(1).max(64),
    players: z.array(steamId64Schema).max(128),
    maxPlayers: z.int().min(1).max(128),
  })
  .meta({ id: 'ServerHeartbeat' });

export type ServerHeartbeat = z.infer<typeof serverHeartbeatSchema>;

/**
 * Resposta do batimento (S07): o que o Carmine.Core aplica agora.
 * - `hostname`: `Carmine | <nome de vitrine> | <código>`; nulo enquanto a Staff não definiu os
 *   dois (o plugin mantém o hostname atual);
 * - `sanctions`: as Punições dos jogadores do batimento (ver `GameSanction`). Ban e kick tiram o
 *   jogador; mute e gag valem até `endsAt` ou até sumirem da lista (revogadas).
 */
export const serverHeartbeatResultSchema = z
  .object({
    hostname: z.string().min(1).nullable(),
    sanctions: z.array(gameSanctionSchema),
  })
  .meta({ id: 'ServerHeartbeatResult' });

export type ServerHeartbeatResult = z.infer<typeof serverHeartbeatResultSchema>;

/** Onde o Servidor Carmine roda; no MVP, todos na VPS de São Paulo (ADR 0009). */
export const serverRegionSchema = z.enum(['sao-paulo']).meta({ id: 'ServerRegion' });

export type ServerRegion = z.infer<typeof serverRegionSchema>;

/**
 * - `online`: batimento recente e vaga pública livre;
 * - `full` (lotado): jogadores ≥ vagas públicas (um VIP ainda entra pela Vaga reservada);
 * - `offline`: sem batimento há {@link SERVER_OFFLINE_AFTER_SECONDS} s (ou nunca mandou).
 */
export const liveServerStateSchema = z
  .enum(['online', 'full', 'offline'])
  .meta({ id: 'LiveServerState' });

export type LiveServerState = z.infer<typeof liveServerStateSchema>;

/**
 * Um Servidor Carmine na lista pública. Offline: `map` nulo e `players` 0; `maxPlayers` é o do
 * último batimento (ou o padrão do Modo, se o servidor nunca mandou um).
 */
export const liveServerSchema = z
  .object({
    id: z.uuid(),
    /** Identificador curto da Staff (ex.: `retake-1`). */
    name: z.string().min(1),
    /** Nome de vitrine (S07), ex.: "Retake · Rotação"; nulo enquanto a Staff não definiu. */
    showcaseName: z.string().min(1).nullable(),
    /** Código do servidor (S07), região·número, ex.: "SP·2"; mostrado pequeno ao lado do IP. */
    code: z.string().min(1).nullable(),
    mode: gameModeSchema,
    /** `host:porta` público: vai no `steam://connect/<address>` e no `connect <address>`. */
    address: z.string().min(1),
    region: serverRegionSchema,
    map: z.string().min(1).nullable(),
    players: z.int().min(0),
    /** Vagas públicas (no Retake, sem a folga da Vaga reservada). */
    maxPlayers: z.int().min(1),
    state: liveServerStateSchema,
    /** Último batimento recebido (também offline: "visto há X min"); nulo se nunca mandou. */
    lastHeartbeatAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'LiveServer' });

export type LiveServer = z.infer<typeof liveServerSchema>;

/**
 * `GET /api/servers` e cada evento `servers` de `GET /api/servers/live`: a lista inteira, por
 * Modo e nome, com o resumo do rodapé. `generatedAt` é quando a API montou este estado.
 */
export const liveServerListSchema = z
  .object({
    servers: z.array(liveServerSchema),
    summary: z
      .object({
        /** Servidores que não estão offline (online ou lotados). */
        online: z.int().min(0),
        /** Jogadores conectados somando todos os servidores. */
        players: z.int().min(0),
      })
      .meta({ id: 'LiveServerSummary' }),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'LiveServerList' });

export type LiveServerList = z.infer<typeof liveServerListSchema>;

/**
 * `GET /api/servers/live` é um stream SSE (`text/event-stream`, ADR 0016): logo ao conectar e a
 * cada mudança, um evento com este nome e o {@link LiveServerList} inteiro em JSON no `data`.
 * Entre eventos, um comentário (`: keepalive`) a cada {@link LIVE_SERVERS_KEEPALIVE_SECONDS} s
 * mantém a conexão viva no Cloudflare; o `retry` diz ao EventSource quando reconectar.
 */
export const LIVE_SERVERS_KEEPALIVE_SECONDS = 15;
export { LIVE_SERVERS_EVENT, LIVE_SERVERS_RETRY_MS } from './rules.js';

/** Um amigo Steam jogando agora num Servidor Carmine. */
export const playingFriendSchema = z
  .object({
    steamId: steamId64Schema,
    publicId: z.int().positive(),
    displayName: z.string().min(1),
    avatarUrl: z.url().nullable(),
    /** `id` do {@link LiveServer} onde ele está: o "Entrar" usa o `address` desse servidor. */
    serverId: z.uuid(),
  })
  .meta({ id: 'PlayingFriend' });

export type PlayingFriend = z.infer<typeof playingFriendSchema>;

/**
 * `GET /api/me/friends-playing` (com sessão; 401 sem ela). Os estados do bloco:
 * - `ok`: a lista de amigos Steam é visível; `friends` vazio é "nenhum amigo jogando";
 * - `private`: a lista de amigos Steam da Conta é privada. `friends` traz os amigos achados
 *   pelas listas públicas de quem está jogando agora (a amizade na Steam é mútua); vazio é
 *   "privada e ninguém achado". Só aparecem amigos mútuos, e só quem está jogando agora;
 * - `unavailable`: a Steam não respondeu (ou a API está sem chave da Steam Web API).
 */
export const friendsPlayingSchema = z
  .discriminatedUnion('status', [
    z.object({ status: z.literal('ok'), friends: z.array(playingFriendSchema) }),
    z.object({ status: z.literal('private'), friends: z.array(playingFriendSchema) }),
    z.object({ status: z.literal('unavailable') }),
  ])
  .meta({ id: 'FriendsPlaying' });

export type FriendsPlaying = z.infer<typeof friendsPlayingSchema>;

/**
 * `GET /api/me/playing` (com sessão; 401 sem ela): o Servidor Carmine onde a Conta da sessão está
 * jogando agora, ou `null`. Alimenta a linha "Jogando agora" do menu da Conta; leva só o que o
 * menu mostra (nome, Modo e mapa), sem endereço nem lotação.
 */
export const nowPlayingSchema = z
  .object({
    server: liveServerSchema
      .pick({ id: true, name: true, showcaseName: true, mode: true, map: true })
      .nullable(),
  })
  .meta({ id: 'NowPlaying' });

export type NowPlaying = z.infer<typeof nowPlayingSchema>;
