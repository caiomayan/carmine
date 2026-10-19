import { z } from 'zod';
import { gameModeSchema } from './game-server.js';
import { staffReasonSchema } from './staff.js';

/** Quantas Contas o Ranking semanal mostra. */
export const RANKING_SIZE = 50;

/** Retake: rounds jogados na semana para entrar no Ranking. */
export const RETAKE_MIN_ROUNDS = 50;

/** Deathmatch: minutos jogados na semana para entrar no Ranking. */
export const DEATHMATCH_MIN_MINUTES = 30;

/** Quantas semanas o seletor lista (a atual e as anteriores com alguma atividade). */
export const RANKING_WEEKS_LISTED = 12;

/** Como o Ranking chama quem tem o Perfil privado (S11). */
export const PRIVATE_PLAYER_NAME = 'Jogador privado';

/** Segunda-feira da semana, `YYYY-MM-DD` (horário de Brasília). */
export const weekStartSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .meta({ id: 'WeekStart', example: '2026-10-12' });

/** Quem aparece numa linha do Ranking: o Perfil privado vira "Jogador privado", sem nada que leve à Conta. */
export const rankingPlayerSchema = z
  .discriminatedUnion('private', [
    z.object({
      private: z.literal(false),
      publicId: z.int().positive(),
      displayName: z.string().min(1),
      avatarUrl: z.url().nullable(),
    }),
    z.object({ private: z.literal(true), displayName: z.literal(PRIVATE_PLAYER_NAME) }),
  ])
  .meta({ id: 'RankingPlayer' });

export type RankingPlayer = z.infer<typeof rankingPlayerSchema>;

export const rankingEntrySchema = z
  .object({
    position: z.int().positive(),
    player: rankingPlayerSchema,
    /** Retake: rounds vencidos. Deathmatch: kills por minuto (2 casas). */
    score: z.number().nonnegative(),
    kd: z.number().nonnegative(),
    headshotPercent: z.number().min(0).max(100).nullable(),
    roundsPlayed: z.int().nonnegative(),
    secondsPlayed: z.int().nonnegative(),
    /** É a linha de quem pede (só vale para quem está logado; nunca identifica outra pessoa). */
    self: z.boolean(),
  })
  .meta({ id: 'RankingEntry' });

export type RankingEntry = z.infer<typeof rankingEntrySchema>;

export const rankingProgressSchema = z
  .object({ unit: z.enum(['rounds', 'minutes']), missing: z.int().positive() })
  .meta({ id: 'RankingProgress' });

export type RankingProgress = z.infer<typeof rankingProgressSchema>;

/** O que o Ranking diz a quem está logado: a própria posição ou quanto falta para entrar. */
export const rankingViewerSchema = z
  .object({
    /** A linha da própria Conta quando elegível (mesmo fora do top 50). */
    entry: rankingEntrySchema.nullable(),
    /** Quanto falta para o mínimo; nulo se já cumpriu. */
    progress: rankingProgressSchema.nullable(),
    /** A Staff removeu a Conta do Ranking desta semana neste Modo. */
    removed: z.boolean(),
  })
  .meta({ id: 'RankingViewer' });

export type RankingViewer = z.infer<typeof rankingViewerSchema>;

/**
 * `GET /api/ranking/{mode}?week=`: o Ranking semanal de um Modo. Sem `week`, a semana atual.
 * `entries` tem até {@link RANKING_SIZE} linhas, já na ordem. `weeks` são as semanas consultáveis,
 * da mais recente para a mais antiga (a atual sempre inclusa).
 */
export const rankingSchema = z
  .object({
    mode: gameModeSchema,
    weekStart: weekStartSchema,
    /** Domingo da semana, `YYYY-MM-DD`. */
    weekEnd: weekStartSchema,
    current: z.boolean(),
    minimum: z.object({ unit: z.enum(['rounds', 'minutes']), value: z.int().positive() }),
    entries: z.array(rankingEntrySchema).max(RANKING_SIZE),
    weeks: z.array(weekStartSchema),
    viewer: rankingViewerSchema.nullable(),
  })
  .meta({ id: 'Ranking' });

export type Ranking = z.infer<typeof rankingSchema>;

/** `POST /api/staff/accounts/{publicId}/ranking-removals` (`ranking.remove`): tirar uma Conta do Ranking de um Modo e semana. */
export const removeRankingEntrySchema = z
  .object({
    mode: gameModeSchema,
    weekStart: weekStartSchema,
    reason: staffReasonSchema,
  })
  .meta({ id: 'RemoveRankingEntry' });

export type RemoveRankingEntry = z.infer<typeof removeRankingEntrySchema>;

/** Uma remoção ativa, como a Staff vê no detalhe da Conta. */
export const rankingRemovalSchema = z
  .object({
    mode: gameModeSchema,
    weekStart: weekStartSchema,
    reason: z.string().min(1),
    removedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'RankingRemoval' });

export type RankingRemoval = z.infer<typeof rankingRemovalSchema>;
