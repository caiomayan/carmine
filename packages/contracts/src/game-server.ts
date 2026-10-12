import { z } from 'zod';
import { gameSanctionSchema } from './moderation.js';
import { steamId64Schema } from './steam.js';

/** Modo de um Servidor Carmine. O 5v5 casual entra depois do MVP. */
export const gameModeSchema = z.enum(['retake', 'deathmatch']).meta({ id: 'GameMode' });

export type GameMode = z.infer<typeof gameModeSchema>;

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
     * Punições da Conta a aplicar já no connect (S07): com um `ban`, o plugin mostra a `message`
     * e tira o jogador do servidor; `mute` e `gag` valem desde o primeiro instante.
     */
    sanctions: z.array(gameSanctionSchema),
  })
  .meta({ id: 'PlayerConnectResult' });

export type PlayerConnectResult = z.infer<typeof playerConnectResultSchema>;
