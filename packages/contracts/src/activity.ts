import './zod-jitless.js';
import { z } from 'zod';
import { gameModeSchema } from './game-server.js';
import { rankingPlayerSchema } from './ranking.js';

/**
 * A faixa de atividade ao vivo da home (Marquee): os últimos acontecimentos interessantes nos
 * Servidores Carmine. Público, sem sessão. Nunca traz SteamID nem id interno de Conta: quem
 * aparece é um {@link rankingPlayerSchema} (nome e link do Perfil).
 *
 * Privacidade: quem tem o Perfil privado não aparece em eventos que mostram presença ou
 * Loadout (entrar, multi-kill, skin equipada). Só o `new_leader` o traz, como "Jogador
 * privado" (`player.private`), igual ao Ranking, que já é público.
 */

/** Quantos eventos a faixa recebe, no máximo. */
export const ACTIVITY_MAX_EVENTS = 20;

/** O servidor onde aconteceu (o `id` leva a `/#servidor-<id>`). */
export const activityServerSchema = z
  .object({
    id: z.uuid(),
    name: z.string().min(1),
    showcaseName: z.string().min(1).nullable(),
    code: z.string().min(1).nullable(),
    mode: gameModeSchema,
  })
  .meta({ id: 'ActivityServer' });

const base = {
  /** Único por evento: serve de chave na lista. */
  id: z.uuid(),
  at: z.iso.datetime({ offset: true }),
};

/** Alguém entrou num servidor. */
export const joinedActivitySchema = z
  .object({
    ...base,
    type: z.literal('joined'),
    player: rankingPlayerSchema,
    server: activityServerSchema,
  })
  .meta({ id: 'JoinedActivity' });

/** Várias mortes seguidas (sem aliado, bot ou aquecimento): `kills` é quantas. */
export const multiKillActivitySchema = z
  .object({
    ...base,
    type: z.literal('multi_kill'),
    player: rankingPlayerSchema,
    server: activityServerSchema,
    kills: z.int().min(3),
  })
  .meta({ id: 'MultiKillActivity' });

/** O primeiro lugar da semana mudou neste Modo. */
export const newLeaderActivitySchema = z
  .object({
    ...base,
    type: z.literal('new_leader'),
    player: rankingPlayerSchema,
    mode: gameModeSchema,
  })
  .meta({ id: 'NewLeaderActivity' });

/** Uma skin que vale o destaque foi equipada. `itemId` é do catálogo; o web resolve o nome. */
export const skinEquippedActivitySchema = z
  .object({
    ...base,
    type: z.literal('skin_equipped'),
    player: rankingPlayerSchema,
    itemId: z.int().positive(),
  })
  .meta({ id: 'SkinEquippedActivity' });

export const activityEventSchema = z
  .discriminatedUnion('type', [
    joinedActivitySchema,
    multiKillActivitySchema,
    newLeaderActivitySchema,
    skinEquippedActivitySchema,
  ])
  .meta({ id: 'ActivityEvent' });

export type ActivityEvent = z.infer<typeof activityEventSchema>;
export type ActivityServer = z.infer<typeof activityServerSchema>;

/**
 * `GET /api/activity/recent`: até {@link ACTIVITY_MAX_EVENTS} eventos, do mais novo para o mais
 * antigo, só das últimas horas (a faixa nunca mostra "entrou" de ontem).
 */
export const recentActivitySchema = z
  .object({
    events: z.array(activityEventSchema).max(ACTIVITY_MAX_EVENTS),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'RecentActivity' });

export type RecentActivity = z.infer<typeof recentActivitySchema>;
