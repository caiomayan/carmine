import { z } from 'zod';
import { gameModeSchema } from './game-server.js';
import { liveServerSchema, playingFriendSchema } from './live-servers.js';
import { loadoutSideSchema, loadoutSlotSchema } from './loadout.js';
import { rankingEntrySchema, rankingProgressSchema, weekStartSchema } from './ranking.js';

/**
 * Prévias do header (U3e): o que cada painel do menu mostra, numa resposta só. Cada seção é
 * independente: se a Steam, o Ranking ou outra fonte falhar, só aquela seção vem vazia, e o
 * endpoint responde 200 (o retrato do Loadout usa os Itens do Inventário: sem eles, vem vazio
 * também). As partes pessoais (`loadout`, `inventory`, `mine`, `friends`) vêm
 * `null` ou vazias sem sessão. Só ids e dados de domínio: nome e imagem das skins o web resolve
 * pelo catálogo dele (PT-BR).
 */

/** Por que o servidor é o recomendado. Sem sessão, sempre `fullest`. */
export const HEADER_RECOMMENDATION_REASONS = ['friends', 'favorite_mode', 'fullest'] as const;

export const recommendationReasonSchema = z
  .enum(HEADER_RECOMMENDATION_REASONS)
  .meta({ id: 'HeaderRecommendationReason' });

export type RecommendationReason = z.infer<typeof recommendationReasonSchema>;

/** Quantos outros servidores o painel "Jogar" lista além do recomendado. */
export const HEADER_OTHER_SERVERS = 3;
/** Quantos Itens recentes o painel "Inventário" lista. */
export const HEADER_LATEST_ITEMS = 4;
/** Quantas linhas do topo o painel "Ranking" lista por Modo. */
export const HEADER_TOP_SIZE = 3;

export const headerRecommendedServerSchema = z
  .object({
    server: liveServerSchema,
    reason: recommendationReasonSchema,
    /** Os amigos neste servidor; vazio se o motivo não é `friends`. */
    friends: z.array(playingFriendSchema),
  })
  .meta({ id: 'HeaderRecommendedServer' });

export const headerPlaySchema = z
  .object({
    /** Nulo quando nenhum servidor está no ar. */
    recommended: headerRecommendedServerSchema.nullable(),
    /** Até {@link HEADER_OTHER_SERVERS} outros servidores no ar (online ou lotados), do mais cheio ao menos cheio. */
    others: z.array(liveServerSchema).max(HEADER_OTHER_SERVERS),
    /** Amigos jogando agora em qualquer servidor; nulo sem sessão ou com a Steam indisponível. */
    friendsPlaying: z.int().min(0).nullable(),
  })
  .meta({ id: 'HeaderPlay' });

/** Um slot do retrato do Loadout. Sem Item equipado, `itemId` e `uid` vêm nulos (arma padrão). */
export const headerLoadoutSlotSchema = z
  .object({
    slot: loadoutSlotSchema,
    /** Id do catálogo da cs2-lib do Item equipado. */
    itemId: z.int().positive().nullable(),
    /** `uid` do Item no Inventário: o editor é `/inventario/<uid>`. */
    uid: z.uuid().nullable(),
    statTrak: z.boolean(),
  })
  .meta({ id: 'HeaderLoadoutSlot' });

export const headerLoadoutSchema = z
  .object({
    side: loadoutSideSchema,
    presetId: z.uuid(),
    presetName: z.string(),
    /** Sempre quatro: faca, luvas, o rifle do lado (AK-47 no TR; M4A1-S se equipado, senão M4A4, no CT) e AWP. */
    slots: z.array(headerLoadoutSlotSchema).length(4),
  })
  .meta({ id: 'HeaderLoadout' });

export const headerLatestItemSchema = z
  .object({
    uid: z.uuid(),
    itemId: z.int().positive(),
    statTrak: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'HeaderLatestItem' });

export const headerInventorySchema = z
  .object({
    total: z.int().min(0),
    limit: z.int().positive(),
    /** Os mais novos primeiro, até {@link HEADER_LATEST_ITEMS}. */
    latest: z.array(headerLatestItemSchema).max(HEADER_LATEST_ITEMS),
  })
  .meta({ id: 'HeaderInventory' });

export const headerRankingModeSchema = z
  .object({
    mode: gameModeSchema,
    /** Até {@link HEADER_TOP_SIZE} linhas; Perfil privado continua anônimo (`player.private`). */
    top: z.array(rankingEntrySchema).max(HEADER_TOP_SIZE),
    /** Nulo sem sessão. */
    mine: z
      .object({
        /** Nulo enquanto a Conta não tem posição (abaixo do mínimo, ou removida da semana). */
        position: z.int().positive().nullable(),
        /** Quanto falta para o mínimo; nulo se já cumpriu. */
        progress: rankingProgressSchema.nullable(),
      })
      .nullable(),
  })
  .meta({ id: 'HeaderRankingMode' });

export const headerRankingSchema = z
  .object({
    weekStart: weekStartSchema,
    /** Domingo da semana, `YYYY-MM-DD`. */
    weekEnd: z.iso.date(),
    /** O instante em que a semana fecha (segunda-feira 00:00 em Brasília): a contagem regressiva. */
    closesAt: z.iso.datetime({ offset: true }),
    modes: z.array(headerRankingModeSchema),
  })
  .meta({ id: 'HeaderRanking' });

/**
 * `GET /api/header-previews?side=ct|t` (público; a parte pessoal vem com a sessão). `side` é o
 * último lado usado no Loadout, que só o navegador guarda; sem ele vale `ct`. As respostas com
 * sessão levam `Cache-Control: private`.
 */
export const headerPreviewsSchema = z
  .object({
    generatedAt: z.iso.datetime({ offset: true }),
    signedIn: z.boolean(),
    play: headerPlaySchema,
    /** Nulo sem sessão, ou se a seção falhou. */
    loadout: headerLoadoutSchema.nullable(),
    /** Nulo sem sessão, ou se a seção falhou. */
    inventory: headerInventorySchema.nullable(),
    /** Nulo se a seção falhou. */
    ranking: headerRankingSchema.nullable(),
  })
  .meta({ id: 'HeaderPreviews' });

export type HeaderPreviews = z.infer<typeof headerPreviewsSchema>;
export type HeaderPlay = z.infer<typeof headerPlaySchema>;
export type HeaderLoadout = z.infer<typeof headerLoadoutSchema>;
export type HeaderInventory = z.infer<typeof headerInventorySchema>;
export type HeaderRanking = z.infer<typeof headerRankingSchema>;
export type HeaderLoadoutSlot = z.infer<typeof headerLoadoutSlotSchema>;
export type HeaderRankingMode = z.infer<typeof headerRankingModeSchema>;
export type HeaderLatestItem = z.infer<typeof headerLatestItemSchema>;
export type HeaderRecommendedServer = z.infer<typeof headerRecommendedServerSchema>;
