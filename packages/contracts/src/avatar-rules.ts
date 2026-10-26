/**
 * Regras do envio e da moderação da foto de perfil (ADR 0022), sem Zod: valem na API e no diálogo de
 * envio do web (`@carmine/contracts/avatar-rules`, carregado só ao clicar em "Trocar foto"). Publica
 * na hora e a moderação é depois (denúncia e Staff). Fora de `rules.ts` de propósito: aquele módulo
 * vai em todas as páginas e cada kB dele pesa no orçamento de JS.
 */

/** Formatos aceitos no envio (conferidos pelos bytes, não pela extensão). O corpo é o arquivo cru. */
export const AVATAR_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** O recorte que o navegador envia: até este tamanho, entre estes lados e quase quadrado (2%). */
export const AVATAR_MAX_UPLOAD_BYTES = 1024 * 1024;
export const AVATAR_MIN_PX = 256;
export const AVATAR_MAX_PX = 1024;
export const AVATAR_SQUARE_TOLERANCE = 0.02;
/** Quantos envios por Conta em 24 h. */
export const AVATAR_UPLOADS_PER_DAY = 3;
/** Contas mais novas que isto (ou com Punição ativa) não enviam foto. */
export const AVATAR_MIN_ACCOUNT_AGE_HOURS = 24;
/** Contas diferentes que denunciam a mesma foto para ela sair do ar até a Staff decidir. */
export const AVATAR_REPORT_SUSPEND_THRESHOLD = 2;
/** Denúncias de foto por pessoa por hora. */
export const AVATAR_REPORTS_PER_HOUR = 5;
/** A Staff decide em até este prazo (aparece para a Staff no painel). */
export const AVATAR_REVIEW_DEADLINE_HOURS = 24;
/** Foto removida pela Staff fica guardada em privado por este tempo e depois é apagada. */
export const AVATAR_REMOVED_RETENTION_DAYS = 30;
/** Bloqueio de novos envios depois de uma remoção: a 1ª, e a reincidência dentro da janela. */
export const AVATAR_BLOCK_DAYS_FIRST = 7;
export const AVATAR_BLOCK_DAYS_REPEAT = 30;
export const AVATAR_REPEAT_WINDOW_DAYS = 90;
export const AVATAR_BLOCK_DAYS_MAX = 365;
