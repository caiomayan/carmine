import { z } from 'zod';
import { gameSanctionSchema } from './moderation.js';
import { steamId64Schema } from './steam.js';

/** Modo de um Servidor Carmine. O 5v5 casual entra depois do MVP. */
export const gameModeSchema = z.enum(['retake', 'deathmatch']).meta({ id: 'GameMode' });

export type GameMode = z.infer<typeof gameModeSchema>;

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
     * Punições da Conta a aplicar já no connect (S07): com um `ban`, o plugin mostra a `message`
     * e tira o jogador do servidor; `mute` e `gag` valem desde o primeiro instante.
     */
    sanctions: z.array(gameSanctionSchema),
    /**
     * O jogador escolheu ocultar o chat dos outros jogadores (`!chat off`): o plugin não entrega a
     * ele as mensagens de chat dos outros. Padrão: chat visível (`false`).
     */
    chatHidden: z.boolean(),
  })
  .meta({ id: 'PlayerConnectResult' });

export type PlayerConnectResult = z.infer<typeof playerConnectResultSchema>;

/**
 * `PUT /api/server/players/{steamId}/chat-preference`: o Carmine.Core grava o `!chat off`
 * (`hidden: true`) ou o `!chat on` (`hidden: false`) de um jogador. Vale por Conta, em todos os
 * Servidores Carmine, até ele mudar de novo. 204; 404 se a Conta não existe.
 */
export const playerChatPreferenceSchema = z
  .strictObject({ hidden: z.boolean() })
  .meta({ id: 'PlayerChatPreference' });

export type PlayerChatPreference = z.infer<typeof playerChatPreferenceSchema>;
