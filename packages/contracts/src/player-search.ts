import { z } from 'zod';

/** Quantos jogadores uma busca devolve. */
export const PLAYER_SEARCH_LIMIT = 8;

/** Menos que isto casaria metade das Contas; mais que isto não é um nome (o limite do nome é 24). */
export const PLAYER_SEARCH_MIN_LENGTH = 2;
export const PLAYER_SEARCH_MAX_LENGTH = 50;

/** `GET /api/players/search?q=`: o que buscar, já sem os espaços das pontas. */
export const playerSearchQuerySchema = z
  .object({
    q: z.string().trim().min(PLAYER_SEARCH_MIN_LENGTH).max(PLAYER_SEARCH_MAX_LENGTH),
  })
  .meta({ id: 'PlayerSearchQuery' });

export type PlayerSearchQuery = z.infer<typeof playerSearchQuerySchema>;

/**
 * Um jogador achado pelo nome. Só o que o Perfil já mostra a qualquer visitante: o nome e o
 * avatar são públicos mesmo com o Perfil privado (S11), que esconde as Estatísticas. Nunca leva
 * o SteamID64; o ID público serve só para montar o link do Perfil.
 */
export const playerSearchHitSchema = z
  .object({
    publicId: z.int().positive(),
    displayName: z.string().min(1),
    avatarUrl: z.url().nullable(),
  })
  .meta({ id: 'PlayerSearchHit' });

export type PlayerSearchHit = z.infer<typeof playerSearchHitSchema>;

/** Até `PLAYER_SEARCH_LIMIT` jogadores, do mais para o menos relevante. */
export const playerSearchSchema = z
  .object({ players: z.array(playerSearchHitSchema).max(PLAYER_SEARCH_LIMIT) })
  .meta({ id: 'PlayerSearch' });

export type PlayerSearch = z.infer<typeof playerSearchSchema>;
