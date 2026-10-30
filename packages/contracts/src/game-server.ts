import './zod-jitless.js';
import { z } from 'zod';
import { gameSanctionSchema } from './moderation.js';
import { steamId64Schema } from './steam.js';
import { vipNoticeSchema } from './vip.js';

/** Modo de um Servidor Carmine. O 5v5 casual entra depois do MVP. */
export const gameModeSchema = z.enum(['retake', 'deathmatch']).meta({ id: 'GameMode' });

export type GameMode = z.infer<typeof gameModeSchema>;

/**
 * Preferência de jogo (ADR 0028): uma escolha do jogador que um plugin de jogo guarda por servidor e
 * que o Carmine guarda na Conta, para valer em todo servidor do Modo. Cada chave nova entra aqui, com
 * o padrão e os Modos onde vale. `awp_raffle`: o jogador está no sorteio da AWP do Retake.
 */
export const gamePreferenceKeySchema = z.enum(['awp_raffle']).meta({ id: 'GamePreferenceKey' });

export type GamePreferenceKey = z.infer<typeof gamePreferenceKeySchema>;

/** O valor de cada chave quando a Conta nunca a mudou (decisão do dono, 2026-10-29: fora do sorteio da AWP). */
export const GAME_PREFERENCE_DEFAULTS: Record<GamePreferenceKey, boolean> = {
  awp_raffle: false,
};

/** Os Modos onde cada chave existe; fora deles a API recusa a escrita e o plugin não aplica nada. */
export const GAME_PREFERENCE_MODES: Record<GamePreferenceKey, readonly GameMode[]> = {
  awp_raffle: ['retake'],
};

/** As Preferências de jogo de uma Conta, com o padrão no lugar do que ela nunca mudou. */
export const gamePreferencesSchema = z
  .strictObject({ awpRaffle: z.boolean() })
  .meta({ id: 'GamePreferences' });

export type GamePreferences = z.infer<typeof gamePreferencesSchema>;

/** Corpo de `PUT /api/server/players/{steamId}/preferences/{key}`: o valor explícito da preferência. */
export const gamePreferenceSetSchema = z
  .strictObject({ enabled: z.boolean() })
  .meta({ id: 'GamePreferenceSet' });

export type GamePreferenceSet = z.infer<typeof gamePreferenceSetSchema>;

/** O valor de uma preferência depois de gravada ou alternada (`PUT` e `POST …/toggle`). */
export const gamePreferenceValueSchema = z
  .strictObject({ key: gamePreferenceKeySchema, enabled: z.boolean() })
  .meta({ id: 'GamePreferenceValue' });

export type GamePreferenceValue = z.infer<typeof gamePreferenceValueSchema>;

/** Nome do mapa como o jogo o conhece (`de_mirage`), sem tratamento. */
export const mapNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .meta({ id: 'MapName', example: 'de_mirage' });

export type MapName = z.infer<typeof mapNameSchema>;

/**
 * Corpo de `POST /api/server/player-connects`: o Carmine.Core avisa que um jogador conectou.
 * `connectedAt` só vem quando o plugin reenvia um connect guardado enquanto a API estava fora.
 */
export const playerConnectSchema = z
  .object({
    steamId: steamId64Schema,
    steamName: z.string().max(128),
    connectedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .meta({ id: 'PlayerConnect' });

export type PlayerConnect = z.infer<typeof playerConnectSchema>;

/** O que o Carmine.Core aplica no jogo depois do connect. */
export const playerConnectResultSchema = z
  .object({
    publicId: z.int().positive(),
    displayName: z.string().min(1),
    /** Primeiro connect da Conta a um Servidor Carmine: o plugin mostra a mensagem de boas-vindas. */
    isFirstConnect: z.boolean(),
    /**
     * A Conta tem VIP ativo agora: no servidor lotado, só o VIP fica na Vaga reservada (S14).
     */
    isVip: z.boolean(),
    /**
     * O aviso do fim do VIP a mostrar no chat do jogo (S14): 3 dias antes, no dia e no dia em que
     * acabou. O plugin o mostra uma vez por conexão, no primeiro spawn. Nulo: nenhum aviso.
     */
    vipNotice: vipNoticeSchema.nullable(),
    /** Quando o VIP ativo acaba (para o plugin dizer em quantos dias); nulo sem VIP ativo. */
    vipEndsAt: z.iso.datetime({ offset: true }).nullable(),
    /**
     * Punições da Conta a aplicar já no connect (S07): com um `ban`, o plugin mostra a `message`
     * e tira o jogador do servidor; `mute` e `gag` valem desde o primeiro instante.
     */
    sanctions: z.array(gameSanctionSchema),
    /**
     * O jogador escolheu ocultar o chat dos outros jogadores (`!chat off`): o plugin não entrega a
     * ele as mensagens de chat dos outros. Padrão: chat visível (`false`).
     */
    chatHidden: z.boolean(),
    /**
     * As Preferências de jogo da Conta que valem no Modo deste servidor (ADR 0028): o plugin as aplica
     * nos plugins de jogo no primeiro spawn de cada conexão, para a escolha acompanhar a Conta de um
     * servidor para o outro.
     */
    preferences: gamePreferencesSchema,
    /**
     * A linha única do connect nos servidores abertos (S16), já em português e sem o prefixo: as
     * boas-vindas da Conta nova no Modo ou uma curiosidade da semana. O plugin a mostra no primeiro
     * spawn de cada conexão. Nulo: nada a mostrar.
     */
    greeting: z.string().nullable(),
  })
  .meta({ id: 'PlayerConnectResult' });

export type PlayerConnectResult = z.infer<typeof playerConnectResultSchema>;

/**
 * `GET /api/server/players/{steamId}/vip`: o VIP da Conta agora, para o `!vip` do jogo (o connect só
 * diz o VIP de quando o jogador entrou). 404 se a Conta não existe.
 */
export const playerVipSchema = z
  .object({
    active: z.boolean(),
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    endedAt: z.iso.datetime({ offset: true }).nullable(),
    notice: vipNoticeSchema.nullable(),
  })
  .meta({ id: 'PlayerVip' });

export type PlayerVip = z.infer<typeof playerVipSchema>;

/**
 * `PUT /api/server/players/{steamId}/chat-preference`: o Carmine.Core grava o `!chat off`
 * (`hidden: true`) ou o `!chat on` (`hidden: false`) de um jogador. Vale por Conta, em todos os
 * Servidores Carmine, até ele mudar de novo. 204; 404 se a Conta não existe.
 */
export const playerChatPreferenceSchema = z
  .strictObject({ hidden: z.boolean() })
  .meta({ id: 'PlayerChatPreference' });

export type PlayerChatPreference = z.infer<typeof playerChatPreferenceSchema>;

/**
 * `GET /api/server/players/{steamId}/card` (S19): os textos do card de boas-vindas em Panorama, já em
 * português, só para quem entrou. O Modo é o do Servidor Carmine que pergunta. Texto vazio: a linha não
 * aparece no card (sem plano, fora do Ranking, sem amigos online, Rating só a partir da S21). O plugin
 * só os entrega ao addon; quem decide o que dizer é a API. 404 se a Conta não existe.
 */
export const playerCardSchema = z
  .strictObject({
    name: z.string(),
    plan: z.string(),
    rank: z.string(),
    friends: z.string(),
    rating: z.string(),
  })
  .meta({ id: 'PlayerCard' });

export type PlayerCard = z.infer<typeof playerCardSchema>;

/**
 * `GET /api/server/players/{steamId}/rank` e `/stats` (S16): a linha pronta, em português, que o
 * `!rank` e o `!stats` mostram só a quem pediu. O Modo é o do Servidor Carmine que pergunta. 404 se a
 * Conta não existe.
 */
export const playerGameLineSchema = z
  .strictObject({ message: z.string().min(1) })
  .meta({ id: 'PlayerGameLine' });

export type PlayerGameLine = z.infer<typeof playerGameLineSchema>;
