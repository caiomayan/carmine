import { z } from 'zod';
import { gameModeSchema } from './game-server.js';
import {
  requiresCheatProof,
  type SanctionMeasure,
  sanctionCategorySchema,
  sanctionEvidenceUrlSchema,
  sanctionMeasureSchema,
  sanctionSuggestionSchema,
  sanctionTypeSchema,
  sanctionWitnessSchema,
} from './moderation.js';
import { steamId64Schema } from './steam.js';
import { vipStatusSchema } from './vip.js';

/**
 * Contratos do painel da Staff (S07): papéis e permissões, busca e detalhe de Conta, aplicar e
 * revogar Punições, VIP, reset do Nome de exibição, nome de vitrine e código dos Servidores
 * Carmine e o log de auditoria. Todas as rotas ficam em `/api/staff/*`, exigem sessão e um papel
 * com a permissão; as mutações exigem `x-csrf-token` e um motivo, que vai para o log.
 */

/** Papel de Staff de uma Conta: Dono, Admin ou Moderador. */
export const staffRoleSchema = z.enum(['owner', 'admin', 'moderator']).meta({ id: 'StaffRole' });

export type StaffRole = z.infer<typeof staffRoleSchema>;

/** Do maior para o menor. */
export const STAFF_ROLE_RANK: Record<StaffRole, number> = { owner: 3, admin: 2, moderator: 1 };

/**
 * O que cada papel pode fazer. A API checa por aqui; o web usa o mesmo mapa para esconder o que
 * o papel não pode.
 * - `accounts.read`: buscar Conta, ver histórico de Punições, VIP, sugestões e auditoria dela;
 * - `sanctions.apply`: aplicar Punições temporárias, kick e aviso;
 * - `sanctions.applyPermanent`: aplicar ban, mute ou gag permanente;
 * - `sanctions.revokeAny`: revogar qualquer Punição (sem ela, só as que a própria pessoa aplicou);
 * - `displayName.reset`: resetar o Nome de exibição;
 * - `vip.manage`: conceder e revogar Período VIP;
 * - `servers.edit`: editar nome de vitrine e código dos Servidores Carmine;
 * - `audit.read`: consultar o log de auditoria inteiro;
 * - `roles.manage`: alterar papéis de Staff (só o Dono);
 * - `accounts.anonymize`: executar um pedido de exclusão de dados (S08), que anonimiza a Conta e
 *   não tem volta (só o Dono, que é o encarregado na Política de Privacidade).
 */
export const STAFF_PERMISSIONS = {
  'accounts.read': ['owner', 'admin', 'moderator'],
  'sanctions.apply': ['owner', 'admin', 'moderator'],
  'sanctions.applyPermanent': ['owner', 'admin'],
  'sanctions.revokeAny': ['owner', 'admin'],
  'displayName.reset': ['owner', 'admin', 'moderator'],
  'vip.manage': ['owner', 'admin'],
  'servers.edit': ['owner', 'admin'],
  'audit.read': ['owner', 'admin'],
  'roles.manage': ['owner'],
  'accounts.anonymize': ['owner'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type StaffPermission = keyof typeof STAFF_PERMISSIONS;

export function staffCan(role: StaffRole | null | undefined, permission: StaffPermission): boolean {
  return role != null && (STAFF_PERMISSIONS[permission] as readonly StaffRole[]).includes(role);
}

/** Uma Conta pela visão da Staff (busca e cabeçalho do detalhe). */
export const staffAccountSummarySchema = z
  .object({
    publicId: z.int().positive(),
    steamId: steamId64Schema,
    displayName: z.string().min(1),
    /** Último nome Steam visto (sem filtro). */
    steamName: z.string(),
    avatarUrl: z.url().nullable(),
    claimed: z.boolean(),
    staffRole: staffRoleSchema.nullable(),
    /** Tipos das Punições valendo agora (ban, mute, gag). */
    activeSanctions: z.array(sanctionTypeSchema),
    lastConnectedAt: z.iso.datetime({ offset: true }).nullable(),
    /**
     * Anonimizada por um pedido de exclusão de dados (S08). Só aparece no painel enquanto um ban
     * mantém o SteamID64 na Conta (para a Staff poder revogá-lo num recurso).
     */
    anonymized: z.boolean(),
  })
  .meta({ id: 'StaffAccountSummary' });

export type StaffAccountSummary = z.infer<typeof staffAccountSummarySchema>;

/**
 * `GET /api/staff/accounts?q=`: até 20 Contas. `q` é um ID público (`10016` ou `#10016`), um
 * SteamID64, um link de perfil Steam com o SteamID64, ou parte do Nome de exibição ou do nome
 * Steam (mínimo 2 caracteres).
 */
export const staffAccountSearchSchema = z
  .object({ accounts: z.array(staffAccountSummarySchema) })
  .meta({ id: 'StaffAccountSearch' });

export type StaffAccountSearch = z.infer<typeof staffAccountSearchSchema>;

export const STAFF_SEARCH_MIN_LENGTH = 2;
export const STAFF_SEARCH_LIMIT = 20;

/** Quem da Staff fez algo (o log guarda o SteamID64; nome e ID público se a Conta existe). */
export const staffActorSchema = z
  .object({
    steamId: steamId64Schema,
    publicId: z.int().positive().nullable(),
    displayName: z.string().nullable(),
  })
  .meta({ id: 'StaffActor' });

export type StaffActor = z.infer<typeof staffActorSchema>;

/**
 * Uma Punição inteira, para a Staff: com o motivo livre, quem aplicou e a revogação.
 * `incidentId` agrupa as medidas aplicadas juntas (ex.: discriminação, 1ª: gag 7 d + ban 1 d);
 * a reincidência conta ocorrências (incidentes), não medidas.
 */
export const staffSanctionSchema = z
  .object({
    id: z.uuid(),
    incidentId: z.uuid(),
    type: sanctionTypeSchema,
    category: sanctionCategorySchema,
    reason: z.string().min(1),
    startsAt: z.iso.datetime({ offset: true }),
    /** Nulo em ban/mute/gag: permanente; em kick e aviso, sempre nulo. */
    endsAt: z.iso.datetime({ offset: true }).nullable(),
    /** Vale agora (ban, mute ou gag não revogado e não vencido). */
    active: z.boolean(),
    /** Testemunha mencionada (ban por cheat); interna, como o motivo. */
    witness: z.string().nullable(),
    /** Link da evidência anexada (ban por cheat); com ela, o Perfil público diz "Cheat". */
    evidenceUrl: z.string().nullable(),
    appliedBy: staffActorSchema,
    revocation: z
      .object({
        at: z.iso.datetime({ offset: true }),
        by: staffActorSchema,
        reason: z.string().min(1),
        /** Recurso aceito: a Punição sai do Perfil público e da reincidência. */
        appealAccepted: z.boolean(),
      })
      .nullable(),
  })
  .meta({ id: 'StaffSanction' });

export type StaffSanction = z.infer<typeof staffSanctionSchema>;

/** Ações registradas no log de auditoria. */
export const staffAuditActionSchema = z
  .enum([
    'vip_grant',
    'vip_revoke',
    'sanction_apply',
    'sanction_revoke',
    'role_grant',
    'role_revoke',
    'display_name_reset',
    'server_update',
    'account_anonymize',
    'account_reserved_id',
  ])
  .meta({ id: 'StaffAuditAction' });

export type StaffAuditAction = z.infer<typeof staffAuditActionSchema>;

/**
 * Uma linha do log de auditoria: autor, ação, alvo (uma Conta ou um Servidor Carmine), motivo,
 * horário e o que mudou (`details`, por ação; ex.: `{ days, endsAtBefore, endsAtAfter }` no VIP,
 * `{ incidentId, category, measures, sanctionIds, suggested }` ao aplicar Punição).
 */
export const staffAuditEntrySchema = z
  .object({
    id: z.uuid(),
    action: staffAuditActionSchema,
    actor: staffActorSchema,
    targetAccount: z
      .object({
        steamId: steamId64Schema,
        /** Nulos se a Conta foi apagada. */
        publicId: z.int().positive().nullable(),
        displayName: z.string().nullable(),
      })
      .nullable(),
    targetServer: z.object({ id: z.uuid(), name: z.string().min(1) }).nullable(),
    reason: z.string().min(1),
    details: z.record(z.string(), z.unknown()),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'StaffAuditEntry' });

export type StaffAuditEntry = z.infer<typeof staffAuditEntrySchema>;

/**
 * `GET /api/staff/audit?actor=&target=&action=&before=&limit=` (permissão `audit.read`): do mais
 * recente para o mais antigo. `actor` e `target` são SteamID64; `before` é o `nextCursor` da
 * página anterior; `limit` de 1 a 100 (padrão 50).
 */
export const staffAuditPageSchema = z
  .object({
    entries: z.array(staffAuditEntrySchema),
    /** Nulo: não há mais páginas. */
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'StaffAuditPage' });

export type StaffAuditPage = z.infer<typeof staffAuditPageSchema>;

export const STAFF_AUDIT_PAGE_DEFAULT = 50;
export const STAFF_AUDIT_PAGE_MAX = 100;

/**
 * `GET /api/staff/accounts/{publicId}` (permissão `accounts.read`): tudo o que o painel mostra de
 * uma Conta. `sanctions` vem inteiro (com avisos e revogadas), do mais recente para o mais
 * antigo; `suggestions` tem uma entrada por Categoria; `audit` são as últimas 20 ações da Staff
 * sobre a Conta.
 */
export const staffAccountDetailSchema = z
  .object({
    account: staffAccountSummarySchema,
    vip: vipStatusSchema,
    sanctions: z.array(staffSanctionSchema),
    suggestions: z.array(sanctionSuggestionSchema),
    audit: z.array(staffAuditEntrySchema),
  })
  .meta({ id: 'StaffAccountDetail' });

export type StaffAccountDetail = z.infer<typeof staffAccountDetailSchema>;

/** Motivo de toda ação da Staff: vai para o log de auditoria. */
export const staffReasonSchema = z.string().trim().min(3).max(500);

/**
 * `POST /api/staff/accounts/{publicId}/sanctions`: aplica uma ocorrência (1 ou 2 medidas, como
 * a sugestão da tabela ou ajustada). Exige `sanctions.apply` e, para medida permanente,
 * `sanctions.applyPermanent`. Não se pune a si mesmo nem quem tem papel igual ou maior (o Dono
 * pune qualquer outro). Um ban derruba as sessões do site da Conta; o ban permanente por cheat
 * também encerra o VIP, sem reembolso. Responde 201 com o detalhe atualizado da Conta.
 *
 * Ban por cheat exige `witness` (testemunha mencionada, da plataforma ou não) ou `evidenceUrl`
 * (link da evidência), ou os dois (decisão do dono, 2026-10-13); nas outras ocorrências, são
 * opcionais. O Perfil público só mostra "Cheat" com a evidência anexada; só com testemunha,
 * mostra "Violação das regras".
 */
export const applySanctionsSchema = z
  .strictObject({
    category: sanctionCategorySchema,
    /** Motivo livre, interno da Staff. */
    reason: staffReasonSchema,
    measures: z
      .array(sanctionMeasureSchema)
      .min(1)
      .max(2)
      .refine((measures) => new Set(measures.map((x) => x.type)).size === measures.length, {
        message: 'um tipo de Punição por ocorrência',
      }),
    witness: sanctionWitnessSchema.optional(),
    evidenceUrl: sanctionEvidenceUrlSchema.optional(),
  })
  .refine(
    (input) =>
      !requiresCheatProof(input.category, input.measures) ||
      input.witness !== undefined ||
      input.evidenceUrl !== undefined,
    {
      message: 'ban por cheat exige testemunha ou link da evidência',
      path: ['evidenceUrl'],
    },
  )
  .meta({ id: 'ApplySanctions' });

export type ApplySanctions = z.infer<typeof applySanctionsSchema>;

/**
 * `POST /api/staff/sanctions/{id}/revoke`: encerra agora uma Punição (ou tira do registro um kick
 * ou aviso). `appealAccepted`: o recurso do jogador foi aceito; a Punição some do Perfil público
 * e não conta na reincidência. Sem `sanctions.revokeAny`, só as que a própria pessoa aplicou.
 * Responde 200 com o detalhe atualizado da Conta.
 */
export const revokeSanctionSchema = z
  .strictObject({ reason: staffReasonSchema, appealAccepted: z.boolean() })
  .meta({ id: 'RevokeSanction' });

export type RevokeSanction = z.infer<typeof revokeSanctionSchema>;

/**
 * `POST /api/staff/accounts/{publicId}/vip/grant` (`vip.manage`): soma ao Período ativo. Como
 * toda mutação sobre uma Conta no painel, responde com o `StaffAccountDetail` atualizado.
 */
export const staffVipGrantSchema = z
  .strictObject({ days: z.int().min(1).max(3650), reason: staffReasonSchema })
  .meta({ id: 'StaffVipGrant' });

export type StaffVipGrant = z.infer<typeof staffVipGrantSchema>;

/**
 * Corpo só com o motivo: `POST .../vip/revoke` (`vip.manage`) e `POST .../display-name/reset`
 * (`displayName.reset`). O reset troca o Nome de exibição por "Jogador #ID" enquanto a Conta
 * mantiver o mesmo nome Steam (até a S11 não há nome próprio); vale no jogo no próximo connect.
 */
export const staffReasonBodySchema = z
  .strictObject({ reason: staffReasonSchema })
  .meta({ id: 'StaffReasonBody' });

export type StaffReasonBody = z.infer<typeof staffReasonBodySchema>;

/** Nome de exibição de uma Conta anonimizada por um pedido de exclusão de dados (S08). */
export const ANONYMIZED_DISPLAY_NAME = 'Conta excluída';

/**
 * `POST /api/staff/accounts/{publicId}/anonymize` (`accounts.anonymize`, só o Dono), com o
 * {@link staffReasonBodySchema} (ex.: "pedido de exclusão pelo contato, protocolo 12"): executa
 * um pedido de exclusão de dados (S08, Política de Privacidade, seção 8). A Conta é anonimizada,
 * sem volta: nome, avatar e Perfil público somem (o Perfil responde 404), o Inventário, os
 * Presets, a preferência de chat e as sessões do site são apagados e o vínculo com a Steam é
 * desfeito; se a pessoa voltar a jogar, nasce uma Conta nova. Ficam as Punições e o log de
 * auditoria (registro interno de moderação) e, com um ban valendo, o SteamID64 punido, para o
 * ban continuar valendo (`steamIdRetained`); o vínculo some quando o ban acabar. Conta da Staff
 * precisa sair da Staff antes (403 `target_protected`); repetir dá 409 `account_anonymized`.
 */
export const accountAnonymizedSchema = z
  .object({
    publicId: z.int().positive(),
    anonymizedAt: z.iso.datetime({ offset: true }),
    /** Havia um ban valendo: o SteamID64 continua na Conta até ele acabar. */
    steamIdRetained: z.boolean(),
  })
  .meta({ id: 'AccountAnonymized' });

export type AccountAnonymized = z.infer<typeof accountAnonymizedSchema>;

/**
 * `PUT /api/staff/accounts/{publicId}/role` (`roles.manage`, só o Dono): `role` nulo tira a Conta
 * da Staff. A Conta precisa estar reivindicada; o último Dono não pode deixar de ser Dono.
 */
export const setStaffRoleSchema = z
  .strictObject({ role: staffRoleSchema.nullable(), reason: staffReasonSchema })
  .meta({ id: 'SetStaffRole' });

export type SetStaffRole = z.infer<typeof setStaffRoleSchema>;

/** Membro da Staff na lista `GET /api/staff/members` (`accounts.read`). */
export const staffMemberSchema = z
  .object({
    publicId: z.int().positive(),
    steamId: steamId64Schema,
    displayName: z.string().min(1),
    avatarUrl: z.url().nullable(),
    role: staffRoleSchema,
    since: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'StaffMember' });

export type StaffMember = z.infer<typeof staffMemberSchema>;

export const staffMemberListSchema = z
  .object({ members: z.array(staffMemberSchema) })
  .meta({ id: 'StaffMemberList' });

/**
 * Nome de vitrine (`showcaseName`): texto livre que descreve a variante do Servidor Carmine
 * ("Retake · Rotação", "Deathmatch · Livre"). Sem `|`, que separa as partes do hostname.
 */
export const serverShowcaseNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[^|\p{Cc}]+$/u, 'sem "|" nem caracteres de controle');

/** Código do servidor: região·número, curto, único (ex.: `SP·1`). O ponto é o `·` (U+00B7). */
export const serverCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2,3}·[1-9]\d?$/, 'use região·número, ex.: SP·1');

/** Hostname do servidor no jogo: `Carmine | <nome de vitrine> | <código>`. */
export function serverHostname(showcaseName: string, code: string): string {
  return `Carmine | ${showcaseName} | ${code}`;
}

/** Um Servidor Carmine no painel (`GET /api/staff/servers`, `servers.edit`). */
export const staffServerSchema = z
  .object({
    id: z.uuid(),
    /** Identificador curto do CLI (ex.: `retake-1`); não muda pelo painel. */
    name: z.string().min(1),
    mode: gameModeSchema,
    address: z.string().min(1),
    showcaseName: z.string().nullable(),
    code: z.string().nullable(),
    /** O hostname aplicado no jogo; nulo enquanto faltar nome de vitrine ou código. */
    hostname: z.string().nullable(),
  })
  .meta({ id: 'StaffServer' });

export type StaffServer = z.infer<typeof staffServerSchema>;

export const staffServerListSchema = z
  .object({ servers: z.array(staffServerSchema) })
  .meta({ id: 'StaffServerList' });

/**
 * `PATCH /api/staff/servers/{id}` (`servers.edit`): o hostname muda no jogo no próximo batimento
 * (até 10 s). Código repetido: 409 `server_code_taken`. Responde 200 com o `StaffServer`.
 */
export const updateStaffServerSchema = z
  .strictObject({
    showcaseName: serverShowcaseNameSchema,
    code: serverCodeSchema,
    reason: staffReasonSchema,
  })
  .meta({ id: 'UpdateStaffServer' });

export type UpdateStaffServer = z.infer<typeof updateStaffServerSchema>;

/**
 * Erros do painel da Staff, com código estável (o web mostra a própria mensagem a partir dele).
 * O status HTTP de cada um está em {@link STAFF_ERROR_STATUS}.
 */
export const STAFF_ERROR_CODES = [
  /** O corpo não está no formato do contrato. */
  'invalid_body',
  /** Sem papel de Staff, ou o papel não tem a permissão. */
  'forbidden',
  /** Nenhuma Conta com esse ID público. */
  'account_not_found',
  'sanction_not_found',
  'server_not_found',
  /** A Punição já foi revogada (ou já venceu, no caso de ban/mute/gag). */
  'sanction_not_active',
  /** Punir a si mesmo, ou alguém da Staff com papel igual ou maior. */
  'target_protected',
  /** Medida permanente sem `sanctions.applyPermanent`. */
  'permanent_not_allowed',
  /** Revogar Punição de outra pessoa sem `sanctions.revokeAny`. */
  'revoke_not_allowed',
  /** Revogar VIP de quem não tem VIP ativo. */
  'no_vip_to_revoke',
  /** Papel para Conta não reivindicada. */
  'account_not_claimed',
  /** Tirar (ou rebaixar) o último Dono. */
  'last_owner',
  /** Outro Servidor Carmine já usa esse código. */
  'server_code_taken',
  /** A Conta já foi anonimizada por um pedido de exclusão de dados. */
  'account_anonymized',
] as const;

export type StaffErrorCode = (typeof STAFF_ERROR_CODES)[number];

export const STAFF_ERROR_STATUS: Record<StaffErrorCode, number> = {
  invalid_body: 400,
  forbidden: 403,
  account_not_found: 404,
  sanction_not_found: 404,
  server_not_found: 404,
  sanction_not_active: 409,
  target_protected: 403,
  permanent_not_allowed: 403,
  revoke_not_allowed: 403,
  no_vip_to_revoke: 409,
  account_not_claimed: 422,
  last_owner: 409,
  server_code_taken: 409,
  account_anonymized: 409,
};

export const staffErrorSchema = z
  .object({
    statusCode: z.int(),
    code: z.enum(STAFF_ERROR_CODES),
    message: z.string(),
  })
  .meta({ id: 'StaffError' });

export type StaffError = z.infer<typeof staffErrorSchema>;

/** Uma medida é permanente: ban, mute ou gag sem duração. */
export function isPermanentMeasure(measure: SanctionMeasure): boolean {
  return measure.durationMinutes === null && measure.type !== 'kick' && measure.type !== 'warning';
}

/**
 * Código de erro de uma mutação do site recusada porque a Conta da sessão está banida (403): o
 * banido entra no site para ver a Punição e como recorrer, mas não muda nada.
 */
export const ACCOUNT_BANNED_CODE = 'account_banned';
