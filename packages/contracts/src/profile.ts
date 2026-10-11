import { z } from 'zod';
import { steamId64Schema } from './steam.js';
import { vipStatusSchema } from './vip.js';

/**
 * Perfil (`Profile`) básico da S03: a página pública de uma Conta em `stcarmine.com/<publicId>`.
 * `avatarUrl` nulo vale o avatar neutro (a Steam ainda não respondeu). O Loadout em vitrine
 * fica vazio até existir Loadout (S05).
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
        /** Sempre vazio até a S05. */
        items: z.array(z.unknown()).max(0),
      })
      .meta({ id: 'LoadoutShowcase' }),
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
  })
  .meta({ id: 'CurrentSession' });

export type CurrentSession = z.infer<typeof currentSessionSchema>;

/** `GET /api/profiles/by-steam-id/{steamId}`: para o web redirecionar (301) ao Perfil. */
export const profileLocationSchema = z
  .object({ publicId: z.int().positive() })
  .meta({ id: 'ProfileLocation' });

export type ProfileLocation = z.infer<typeof profileLocationSchema>;

/** Endereço do perfil Steam de um SteamID64. */
export function steamProfileUrl(steamId: string): string {
  return `https://steamcommunity.com/profiles/${steamId}`;
}
