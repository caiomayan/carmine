import './zod-jitless.js';
import { z } from 'zod';

/**
 * Rating Carmine (S21, ADR 0029): o que a API devolve por Modo. Os pesos e a conta ficam na API; o
 * contrato só leva o resultado, para o Perfil, o Ranking, o `!rank` e o card falarem a mesma coisa.
 */

/** Rounds no Modo, desde o início da coleta, para o Rating aparecer (antes: `Calibrando 37/100`). */
export const RATING_MIN_ROUNDS = 100;

/** A janela do número do Perfil e da população: os últimos 90 dias. O Ranking usa a semana. */
export const RATING_WINDOW_DAYS = 90;

/** Os Modos que têm Rating (o Deathmatch tem a Pontuação DM, ADR 0030). O 5v5 entra com a S23. */
export const RATING_MODES = ['retake'] as const;

export type RatingMode = (typeof RATING_MODES)[number];

/**
 * O Rating Carmine de uma Conta num Modo. Nunca é um número inventado: `calibrating` ainda não tem
 * 100 rounds no Modo (o Perfil mostra `Calibrando 37/100`), `no_rounds` tem 100 na vida mas nenhum
 * na janela, e `no_population` é o Modo ainda sem Contas suficientes para comparar.
 */
export const modeRatingSchema = z
  .discriminatedUnion('status', [
    z.object({
      status: z.literal('rated'),
      /** Média 1,00, com 2 casas. */
      rating: z.number(),
      /** Os rounds da janela. */
      rounds: z.number().int().nonnegative(),
    }),
    z.object({
      status: z.literal('calibrating'),
      rounds: z.number().int().nonnegative(),
      required: z.literal(RATING_MIN_ROUNDS),
    }),
    z.object({ status: z.literal('no_rounds') }),
    z.object({ status: z.literal('no_population') }),
  ])
  .meta({ id: 'ModeRating' });

export type ModeRating = z.infer<typeof modeRatingSchema>;

/** O Rating Carmine geral: a média dos Modos que aparecem, pesada pelos rounds da janela. */
export const overallRatingSchema = z
  .object({ rating: z.number(), rounds: z.number().int().positive() })
  .meta({ id: 'OverallRating' });

export type OverallRating = z.infer<typeof overallRatingSchema>;
