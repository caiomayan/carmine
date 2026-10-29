import './zod-jitless.js';
import { z } from 'zod';
import { cs2ItemSchema } from './inventory.js';
import { liveServerSchema } from './live-servers.js';
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

export {
  DISPLAY_NAME_COOLDOWN_DAYS,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
} from './rules.js';

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
    /** Quando a Conta nasceu (o primeiro connect a um Servidor Carmine ou o primeiro login no site). */
    memberSince: z.iso.datetime({ offset: true }),
    /**
     * Período VIP ativo agora: só o selo. Quando o VIP acaba ou quanto falta é da própria Conta
     * (`vip` em `/api/me`), nunca do Perfil público.
     */
    isVip: z.boolean(),
    loadoutShowcase: z
      .object({
        items: z.array(showcaseItemSchema),
      })
      .meta({ id: 'LoadoutShowcase' }),
    /** Punições ativas e o histórico público (S07); o Perfil privado não as esconde. */
    sanctions: profileSanctionsSchema,
    /**
     * Perfil privado (S11): a Conta escondeu as Estatísticas e a identidade no Ranking. Nome,
     * avatar, Loadout e presença em servidor continuam públicos. Quem desenha Estatísticas (S12)
     * não mostra nada quando isto é `true`.
     */
    isPrivate: z.boolean(),
  })
  .meta({ id: 'Profile' });

export type Profile = z.infer<typeof profileSchema>;

/**
 * `GET /api/profiles/{publicId}/playing`: o Servidor Carmine em que a Conta está jogando agora,
 * ou `server` nulo. A presença é pública, também no Perfil privado (só as Estatísticas somem
 * dele). Leva o endereço porque o Perfil oferece "Entrar junto" (`steam://connect`).
 */
export const profilePlayingSchema = z
  .object({
    server: liveServerSchema
      .pick({
        id: true,
        name: true,
        showcaseName: true,
        mode: true,
        map: true,
        address: true,
        state: true,
      })
      .nullable(),
  })
  .meta({ id: 'ProfilePlaying' });

export type ProfilePlaying = z.infer<typeof profilePlayingSchema>;

/** Quando a Conta pode trocar o Nome de exibição e se ela tem um nome próprio (S11). */
export const displayNameChangeSchema = z
  .object({
    /** A Conta tem um nome próprio; sem ele, vale o nome Steam. */
    custom: z.boolean(),
    /** Antes disto a troca é recusada; nulo quando já pode trocar. */
    nextChangeAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'DisplayNameChange' });

export type DisplayNameChange = z.infer<typeof displayNameChangeSchema>;

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
    /**
     * Quantos dias os Itens VIP ficam guardados depois do fim do VIP (S14a, `VIP_HOLD_ENABLED`). Nulo com a guarda
     * desligada: aí os Itens seguem no Inventário (só deixam de ir para o jogo). O aviso do fim do VIP no site
     * diz uma coisa ou a outra conforme este campo; o web nunca lê a variável de ambiente.
     */
    vipHoldDays: z.int().positive().nullable(),
    /** Papel de Staff da Conta (S07); nulo para quem não é da Staff. */
    staffRole: staffRoleSchema.nullable(),
    /**
     * Punições valendo agora (ban, mute, gag) com o motivo da Staff, só para a própria Conta: o
     * aviso do jogador punido no site (o Perfil público mostra só a Categoria).
     */
    sanctions: z.array(ownSanctionSchema),
    /** Estado da troca do Nome de exibição, para a interface decidir o que oferecer (S11). */
    displayNameChange: displayNameChangeSchema,
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

/** `PUT /api/me/display-name`: o nome que a pessoa quer; o servidor normaliza e valida. */
export const changeDisplayNameInputSchema = z
  .object({ displayName: z.string().max(200) })
  .meta({ id: 'ChangeDisplayNameInput' });

export type ChangeDisplayNameInput = z.infer<typeof changeDisplayNameInputSchema>;

/** O Nome de exibição já trocado (normalizado) e quando dá para trocar de novo. */
export const displayNameChangedSchema = z
  .object({
    displayName: z.string().min(1),
    nextChangeAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'DisplayNameChanged' });

export type DisplayNameChanged = z.infer<typeof displayNameChangedSchema>;

/**
 * `DELETE /api/me/display-name`: a Conta voltou ao nome Steam. O prazo da próxima troca continua
 * contando da última troca (voltar não o reinicia): `nextChangeAt` é nulo quando já passou.
 */
export const displayNameRevertedSchema = z
  .object({
    displayName: z.string().min(1),
    nextChangeAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'DisplayNameReverted' });

export type DisplayNameReverted = z.infer<typeof displayNameRevertedSchema>;

/**
 * Códigos estáveis da recusa de uma troca de Nome de exibição (o HTTP está em
 * {@link DISPLAY_NAME_ERROR_STATUS}).
 */
export const DISPLAY_NAME_ERROR_CODES = [
  /** O corpo não está no formato do contrato. */
  'invalid_body',
  /** Menos de {@link DISPLAY_NAME_MIN_LENGTH} caracteres depois de normalizado. */
  'too_short',
  /** Mais de {@link DISPLAY_NAME_MAX_LENGTH} caracteres depois de normalizado. */
  'too_long',
  /** Marcação (`<>&{}`), acentos empilhados, ou sem nenhuma letra ou número. */
  'invalid_chars',
  /** O filtro de palavras ofensivas reprovou o nome. */
  'offensive',
  /** A última troca foi há menos de {@link DISPLAY_NAME_COOLDOWN_DAYS} dias (`nextChangeAt`). */
  'too_soon',
  /** Só a Conta reivindicada tem nome próprio. */
  'not_claimed',
] as const;

export type DisplayNameErrorCode = (typeof DISPLAY_NAME_ERROR_CODES)[number];

export const DISPLAY_NAME_ERROR_STATUS = {
  invalid_body: 400,
  too_short: 422,
  too_long: 422,
  invalid_chars: 422,
  offensive: 422,
  too_soon: 409,
  not_claimed: 403,
} as const satisfies Record<DisplayNameErrorCode, number>;

export const displayNameErrorSchema = z
  .object({
    statusCode: z.int(),
    code: z.enum(DISPLAY_NAME_ERROR_CODES),
    message: z.string(),
    /** Só em `too_soon`: quando a troca fica livre. */
    nextChangeAt: z.iso.datetime({ offset: true }).optional(),
  })
  .meta({ id: 'DisplayNameError' });

export type DisplayNameError = z.infer<typeof displayNameErrorSchema>;

/** `PUT /api/me/privacy`: liga ou desliga o Perfil privado (S11). */
export const profilePrivacyInputSchema = z
  .object({ isPrivate: z.boolean() })
  .meta({ id: 'ProfilePrivacyInput' });

export type ProfilePrivacyInput = z.infer<typeof profilePrivacyInputSchema>;
