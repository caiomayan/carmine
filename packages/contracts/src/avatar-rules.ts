/**
 * Regras do envio e da moderação da foto de perfil (ADR 0022), sem Zod: valem na API e no diálogo de
 * envio do web (`@carmine/contracts/avatar-rules`, carregado só ao clicar em "Trocar foto"). Publica
 * na hora e a moderação é depois (denúncia só entra na fila da Staff; a regra do beta é a do ADR 0025). Fora de `rules.ts` de propósito: aquele módulo
 * vai em todas as páginas e cada kB dele pesa no orçamento de JS.
 */

/** Formatos aceitos no envio (conferidos pelos bytes, não pela extensão). O corpo é o arquivo cru. */
export const AVATAR_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** O recorte que o navegador envia: até este tamanho, entre estes lados e quase quadrado (2%). */
export const AVATAR_MAX_UPLOAD_BYTES = 1024 * 1024;
export const AVATAR_MIN_PX = 256;
export const AVATAR_MAX_PX = 1024;
export const AVATAR_SQUARE_TOLERANCE = 0.02;
/**
 * Limite de envios por Conta (regra interna: nenhuma tela mostra estes números). `AVATAR_UPLOADS_PER_WINDOW` envios
 * a cada `AVATAR_UPLOAD_WINDOW_MINUTES` min (janela deslizante) e `AVATAR_UPLOAD_GAP_SECONDS` s entre um envio e
 * outro. Escolher uma foto do histórico não é um envio e não conta.
 */
export const AVATAR_UPLOADS_PER_WINDOW = 5;
export const AVATAR_UPLOAD_WINDOW_MINUTES = 30;
export const AVATAR_UPLOAD_GAP_SECONDS = 10;
/** Quantas fotos o histórico guarda (a atual e as anteriores); a mais velha sai quando entra a seguinte. */
export const AVATAR_HISTORY_SIZE = 5;
/** Denúncias de foto por pessoa por hora. */
export const AVATAR_REPORTS_PER_HOUR = 5;
/** A Staff decide em até este prazo (aparece para a Staff no painel). */
export const AVATAR_REVIEW_DEADLINE_HOURS = 24;
/** Foto removida pela Staff fica guardada em privado por este tempo e depois é apagada. */
export const AVATAR_REMOVED_RETENTION_DAYS = 30;
/** Bloqueio de novos envios depois de uma remoção: a Staff escolhe os dias (0 não bloqueia); este é o sugerido. */
export const AVATAR_BLOCK_DAYS_SUGGESTED = 7;
export const AVATAR_BLOCK_DAYS_MAX = 365;
/**
 * Quem denuncia muito o que a Staff mantém perde peso: com pelo menos `AVATAR_REPORTER_KEPT_MIN` denúncias
 * mantidas pela Staff nos últimos `AVATAR_REPORTER_WINDOW_DAYS` dias, e mais mantidas do que confirmadas, as
 * denúncias da Conta vão para o fim da fila.
 */
export const AVATAR_REPORTER_KEPT_MIN = 3;
export const AVATAR_REPORTER_WINDOW_DAYS = 90;
