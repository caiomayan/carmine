import { z } from 'zod';
import { staffReasonSchema } from './staff.js';
import { steamId64Schema } from './steam.js';

/**
 * Foto de perfil própria (ADR 0022). A Conta envia um recorte quadrado; a API refaz a imagem em
 * 4 tamanhos WebP sem metadados e a **publica na hora**. A moderação vem depois: denúncia (duas
 * Contas diferentes tiram a foto do ar até a Staff decidir), remoção em um clique pela Staff e
 * bloqueio de reincidentes só no histórico da Staff. Sem foto própria (ou depois de "usar a foto
 * da Steam"), vale o avatar da Steam. `Profile.avatarUrl` é sempre o avatar efetivo: quem lê o
 * avatar não muda nada.
 */

export {
  AVATAR_ACCEPTED_TYPES,
  AVATAR_BLOCK_DAYS_FIRST,
  AVATAR_BLOCK_DAYS_MAX,
  AVATAR_BLOCK_DAYS_REPEAT,
  AVATAR_MAX_PX,
  AVATAR_MAX_UPLOAD_BYTES,
  AVATAR_MIN_ACCOUNT_AGE_HOURS,
  AVATAR_MIN_PX,
  AVATAR_REMOVED_RETENTION_DAYS,
  AVATAR_REPEAT_WINDOW_DAYS,
  AVATAR_REPORT_SUSPEND_THRESHOLD,
  AVATAR_REPORTS_PER_HOUR,
  AVATAR_REVIEW_DEADLINE_HOURS,
  AVATAR_SIZES,
  AVATAR_SQUARE_TOLERANCE,
  AVATAR_UPLOADS_PER_DAY,
  type AvatarSize,
  avatarVariantUrl,
} from './rules.js';

/** De onde vem o avatar que todos veem. */
export const avatarSourceSchema = z.enum(['steam', 'custom']).meta({ id: 'AvatarSource' });

export type AvatarSource = z.infer<typeof avatarSourceSchema>;

/**
 * Motivo de uma denúncia ou de uma remoção, no vocabulário da interface (a mesma lista para a
 * pessoa que denuncia e para a Staff que remove).
 */
export const AVATAR_REASONS = [
  'sexual',
  'violence',
  'hate',
  'minor',
  'personal_data',
  'other',
] as const;

export const avatarReasonSchema = z.enum(AVATAR_REASONS).meta({ id: 'AvatarReason' });

export type AvatarReason = z.infer<typeof avatarReasonSchema>;

export const AVATAR_REASON_LABELS: Record<AvatarReason, string> = {
  sexual: 'Nudez ou conteúdo sexual',
  violence: 'Violência',
  hate: 'Ódio ou discriminação',
  minor: 'Menor de idade em situação indevida',
  personal_data: 'Dado pessoal ou foto de terceiro',
  other: 'Outro',
};

/**
 * Por que a Conta não pode enviar foto agora. O bloqueio de reincidente aparece só como
 * `upload_blocked`, sem o motivo nem a data (fica no histórico da Staff).
 */
export const AVATAR_INELIGIBLE_REASONS = [
  /** Conta com menos de `AVATAR_MIN_ACCOUNT_AGE_HOURS` horas. */
  'account_too_new',
  /** Punição ativa (ban, mute ou gag). */
  'punished',
  /** Envio bloqueado depois de uma remoção pela Staff. */
  'upload_blocked',
  /** `AVATAR_UPLOADS_PER_DAY` envios em 24 h; `retryAfter` diz quando libera. */
  'daily_limit',
] as const;

export const avatarIneligibleReasonSchema = z
  .enum(AVATAR_INELIGIBLE_REASONS)
  .meta({ id: 'AvatarIneligibleReason' });

export type AvatarIneligibleReason = z.infer<typeof avatarIneligibleReasonSchema>;

/**
 * `GET /api/me/avatar` (e a resposta de enviar e de voltar à Steam): o que a Conta da sessão tem.
 * `enabled` falso: a funcionalidade está desligada neste ambiente (sem as variáveis do R2) e o web
 * não mostra nada. `custom` é a foto própria: `suspended` quer dizer que duas Contas a denunciaram
 * e ela está fora do ar até a Staff decidir (todos veem a da Steam; o dono é avisado). `removal`
 * é a última remoção pela Staff nos últimos 30 dias, para o aviso.
 */
export const avatarStateSchema = z
  .object({
    enabled: z.boolean(),
    source: avatarSourceSchema,
    /** O avatar da Steam, sempre guardado: é para onde se volta. Nulo: a Steam ainda não respondeu. */
    steamAvatarUrl: z.url().nullable(),
    custom: z
      .object({
        /** Maior tamanho; os outros saem por `avatarVariantUrl`. */
        url: z.url(),
        status: z.enum(['active', 'suspended']),
        uploadedAt: z.iso.datetime({ offset: true }),
      })
      .nullable(),
    canUpload: z.boolean(),
    cannotUploadReason: avatarIneligibleReasonSchema.nullable(),
    /** Só em `daily_limit`: quando o próximo envio libera. */
    retryAfter: z.iso.datetime({ offset: true }).nullable(),
    removal: z
      .object({ at: z.iso.datetime({ offset: true }), reason: avatarReasonSchema })
      .nullable(),
  })
  .meta({ id: 'AvatarState' });

export type AvatarState = z.infer<typeof avatarStateSchema>;

/**
 * Códigos estáveis das recusas das rotas de foto (o HTTP de cada um em `AVATAR_ERROR_STATUS`).
 * Os de elegibilidade repetem `AVATAR_INELIGIBLE_REASONS`.
 */
export const AVATAR_ERROR_CODES = [
  /** Funcionalidade desligada neste ambiente. */
  'disabled',
  /** O corpo não está no formato do contrato (denúncia). */
  'invalid_body',
  /** `Content-Type` fora de `AVATAR_ACCEPTED_TYPES`, ou os bytes não são desse tipo. */
  'unsupported_type',
  /** Corpo maior que `AVATAR_MAX_UPLOAD_BYTES`. */
  'too_large',
  /** Não abre como imagem, é animada ou foi recusada na decodificação. */
  'invalid_image',
  /** Lado fora de `AVATAR_MIN_PX`..`AVATAR_MAX_PX`, ou fora do quadrado. */
  'bad_dimensions',
  'account_too_new',
  'punished',
  'upload_blocked',
  /** `retryAfter` diz quando libera. */
  'daily_limit',
  /** Denunciar o Perfil de quem não tem foto própria no ar. */
  'no_custom_avatar',
  /** Denunciar a própria foto. */
  'own_avatar',
  /** Esta Conta já denunciou esta foto. */
  'already_reported',
  /** Mais de `AVATAR_REPORTS_PER_HOUR` denúncias de foto na última hora. */
  'report_limit',
] as const;

export type AvatarErrorCode = (typeof AVATAR_ERROR_CODES)[number];

export const AVATAR_ERROR_STATUS: Record<AvatarErrorCode, number> = {
  disabled: 503,
  invalid_body: 400,
  unsupported_type: 415,
  too_large: 413,
  invalid_image: 422,
  bad_dimensions: 422,
  account_too_new: 403,
  punished: 403,
  upload_blocked: 403,
  daily_limit: 429,
  no_custom_avatar: 404,
  own_avatar: 422,
  already_reported: 409,
  report_limit: 429,
};

export const avatarErrorSchema = z
  .object({
    statusCode: z.int(),
    code: z.enum(AVATAR_ERROR_CODES),
    message: z.string(),
    /** Só em `daily_limit` e `report_limit`: quando tentar de novo. */
    retryAfter: z.iso.datetime({ offset: true }).optional(),
  })
  .meta({ id: 'AvatarError' });

export type AvatarError = z.infer<typeof avatarErrorSchema>;

/** `POST /api/profiles/{publicId}/avatar-report`: precisa de sessão. */
export const avatarReportInputSchema = z
  .object({ reason: avatarReasonSchema })
  .meta({ id: 'AvatarReportInput' });

export type AvatarReportInput = z.infer<typeof avatarReportInputSchema>;

/** A denúncia entrou na fila. Não diz se a foto saiu do ar (não ensina a denunciar em dupla). */
export const avatarReportReceivedSchema = z
  .object({ received: z.literal(true) })
  .meta({ id: 'AvatarReportReceived' });

export type AvatarReportReceived = z.infer<typeof avatarReportReceivedSchema>;

/* ------------------------------ painel da Staff ------------------------------ */

/**
 * O estado de uma foto própria: `active` no ar; `suspended` fora do ar por denúncias até a Staff
 * decidir; `removed` pela Staff (guardada em privado por `AVATAR_REMOVED_RETENTION_DAYS` dias);
 * `replaced` e `reverted` quando a pessoa trocou ou voltou à Steam (arquivos apagados).
 */
export const avatarStatusSchema = z
  .enum(['active', 'suspended', 'removed', 'replaced', 'reverted'])
  .meta({ id: 'AvatarStatus' });

export type AvatarStatus = z.infer<typeof avatarStatusSchema>;

/** Uma foto na visão da Staff. `url` é pública só enquanto `active`; nos outros estados, a imagem vem de `/api/staff/avatars/{id}/image`. */
export const staffAvatarSchema = z
  .object({
    id: z.uuid(),
    status: avatarStatusSchema,
    url: z.url().nullable(),
    uploadedAt: z.iso.datetime({ offset: true }),
    /** Quando saiu do ar (suspensa ou removida). */
    takenDownAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .meta({ id: 'StaffAvatar' });

export type StaffAvatar = z.infer<typeof staffAvatarSchema>;

const staffPersonSchema = z.object({
  steamId: steamId64Schema,
  publicId: z.int().positive().nullable(),
  displayName: z.string().nullable(),
});

/** A decisão da Staff sobre uma foto denunciada. */
export const staffAvatarDecisionSchema = z
  .object({
    decision: z.enum(['keep', 'remove']),
    reason: avatarReasonSchema.nullable(),
    note: z.string(),
    at: z.iso.datetime({ offset: true }),
    by: staffPersonSchema,
  })
  .meta({ id: 'StaffAvatarDecision' });

export type StaffAvatarDecision = z.infer<typeof staffAvatarDecisionSchema>;

/** Um caso da fila de denúncias de foto: a foto, quem a tem, o que dizem e o histórico da Conta. */
export const staffAvatarCaseSchema = z
  .object({
    avatar: staffAvatarSchema,
    account: z.object({
      publicId: z.int().positive(),
      displayName: z.string(),
    }),
    reports: z.object({
      /** Contas diferentes que denunciaram esta foto. */
      reporters: z.int().nonnegative(),
      byReason: z.array(z.object({ reason: avatarReasonSchema, count: z.int().positive() })),
      firstAt: z.iso.datetime({ offset: true }),
      lastAt: z.iso.datetime({ offset: true }),
    }),
    /** Remoções anteriores desta Conta (a reincidência pesa no bloqueio). */
    previousRemovals: z.int().nonnegative(),
    /** Nulo enquanto a Staff não decidiu. */
    decision: staffAvatarDecisionSchema.nullable(),
  })
  .meta({ id: 'StaffAvatarCase' });

export type StaffAvatarCase = z.infer<typeof staffAvatarCaseSchema>;

/**
 * `GET /api/staff/avatar-reports?status=&before=&limit=`: a fila. `open` (padrão) são as fotos com
 * denúncia ainda sem decisão, as mais antigas primeiro (vencem o prazo de
 * `AVATAR_REVIEW_DEADLINE_HOURS` h antes); `decided` vai da mais recente para a mais antiga.
 */
export const staffAvatarCasePageSchema = z
  .object({
    cases: z.array(staffAvatarCaseSchema),
    nextCursor: z.string().nullable(),
    openCount: z.int().nonnegative(),
  })
  .meta({ id: 'StaffAvatarCasePage' });

export type StaffAvatarCasePage = z.infer<typeof staffAvatarCasePageSchema>;

/**
 * `POST /api/staff/avatars/{id}/decision` e `POST /api/staff/accounts/{publicId}/avatar/remove`
 * (remoção sem denúncia, direto da ficha da Conta; aqui `decision` só vale `remove`).
 * - `keep`: a foto volta ao ar (se estava suspensa) e as denúncias contra ela são arquivadas;
 * - `remove`: a foto sai, a Conta volta à Steam e a imagem fica guardada em privado. `reason` é
 *   obrigatório. O bloqueio de novos envios segue a regra (primeira: 7 dias; reincidência em 90
 *   dias: 30); `blockDays` a substitui (0 não bloqueia).
 * `note` vai para o log de auditoria.
 */
export const avatarDecisionInputSchema = z
  .object({
    decision: z.enum(['keep', 'remove']),
    reason: avatarReasonSchema.optional(),
    note: staffReasonSchema,
    blockDays: z.int().min(0).max(365).optional(),
  })
  .refine((body) => body.decision === 'keep' || body.reason !== undefined, {
    path: ['reason'],
    message: 'a remoção precisa do motivo',
  })
  .meta({ id: 'AvatarDecisionInput' });

export type AvatarDecisionInput = z.infer<typeof avatarDecisionInputSchema>;

/**
 * `GET /api/staff/accounts/{publicId}/avatar`: a foto na ficha da Conta. `uploadBlockedUntil`
 * é o bloqueio de reincidente (só a Staff o vê).
 */
export const staffAccountAvatarSchema = z
  .object({
    source: avatarSourceSchema,
    current: staffAvatarSchema.nullable(),
    uploadBlockedUntil: z.iso.datetime({ offset: true }).nullable(),
    removals: z.array(
      z.object({
        avatarId: z.uuid(),
        at: z.iso.datetime({ offset: true }),
        reason: avatarReasonSchema,
        note: z.string(),
        by: staffPersonSchema,
      }),
    ),
  })
  .meta({ id: 'StaffAccountAvatar' });

export type StaffAccountAvatar = z.infer<typeof staffAccountAvatarSchema>;
