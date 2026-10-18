import { z } from 'zod';
import { cs2ItemSchema } from './inventory.js';
import { loadoutSlotSchema, loadoutSlotSideSchema } from './loadout.js';
import { ownSanctionSchema, profileSanctionsSchema } from './moderation.js';
import { staffRoleSchema } from './staff.js';
import { steamId64Schema } from './steam.js';
import { vipStatusSchema } from './vip.js';

/**
 * Um Item do Loadout em vitrine: só o que vai para o jogo, já sem os atributos VIP quando a
 * Conta não tem Período VIP ativo (a mesma regra do `equipped/v5`).
 */
export const showcaseItemSchema = z
  .object({
    slot: loadoutSlotSchema,
    side: loadoutSlotSideSchema,
    item: cs2ItemSchema,
  })
  .meta({ id: 'ShowcaseItem' });

export type ShowcaseItem = z.infer<typeof showcaseItemSchema>;

/**
 * Perfil (`Profile`) da S03: a página pública de uma Conta em `stcarmine.com/<publicId>`.
 * `avatarUrl` nulo vale o avatar neutro (a Steam ainda não respondeu). O Loadout em vitrine é o
 * Preset ativo (S05), na ordem dos slots do Loadout.
 */
export const profileSchema = z
  .object({
    publicId: z.int().positive(),
    displayName: z.string().min(1),
    avatarUrl: z.url().nullable(),
    steamId: steamId64Schema,
    /** Perfil da pessoa na Steam (`https://steamcommunity.com/profiles/<steamId>`). */
    steamProfileUrl: z.url(),
    /** A pessoa já fez login no site (Conta reivindicada). */
    claimed: z.boolean(),
    loadoutShowcase: z
      .object({
        items: z.array(showcaseItemSchema),
      })
      .meta({ id: 'LoadoutShowcase' }),
    /** Punições ativas e o histórico público (S07); o Perfil privado não as esconde. */
    sanctions: profileSanctionsSchema,
  })
  .meta({ id: 'Profile' });

export type Profile = z.infer<typeof profileSchema>;

/** `GET /api/me`: a Conta da sessão atual e o token CSRF das mutações. */
export const currentSessionSchema = z
  .object({
    account: profileSchema,
    /** Vai no cabeçalho `x-csrf-token` de toda mutação (também no cookie `carmine_csrf`). */
    csrfToken: z.string().min(1),
    /**
     * Esta sessão nasceu do login que reivindicou a Conta (o primeiro login dela): o web
     * mostra os Primeiros passos sozinho só nela. Vale enquanto a sessão durar.
     */
    firstLogin: z.boolean(),
    /** Período VIP da Conta: decide o cadeado dos Itens VIP no editor (S04). */
    vip: vipStatusSchema,
    /** Papel de Staff da Conta (S07); nulo para quem não é da Staff. */
    staffRole: staffRoleSchema.nullable(),
    /**
     * Punições valendo agora (ban, mute, gag) com o motivo da Staff, só para a própria Conta: o
     * aviso do jogador punido no site (o Perfil público mostra só a Categoria).
     */
    sanctions: z.array(ownSanctionSchema),
  })
  .meta({ id: 'CurrentSession' });

export type CurrentSession = z.infer<typeof currentSessionSchema>;

/** `GET /api/profiles/by-steam-id/{steamId}`: para o web redirecionar (301) ao Perfil. */
export const profileLocationSchema = z
  .object({ publicId: z.int().positive() })
  .meta({ id: 'ProfileLocation' });

export type ProfileLocation = z.infer<typeof profileLocationSchema>;

/**
 * `GET /api/profiles/former-ids`: os IDs públicos que a Staff trocou por um ID reservado (S10,
 * ADR 0013). O web responde 301 de `/<from>` para `/<to>`. A lista só cresce por ação manual da
 * Staff (poucas dezenas), então vai inteira e o web a guarda por alguns segundos.
 */
export const formerPublicIdsSchema = z
  .object({
    redirects: z.array(z.object({ from: z.int().positive(), to: z.int().positive() })),
  })
  .meta({ id: 'FormerPublicIds' });

export type FormerPublicIds = z.infer<typeof formerPublicIdsSchema>;

/** Endereço do perfil Steam de um SteamID64. */
export function steamProfileUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${steamId}`;
}
