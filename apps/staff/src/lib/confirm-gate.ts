/**
 * O passo de confirmação das ações que mexem em dinheiro ou não têm volta (`ActionForm`): primeiro o formulário mostra o
 * que vai acontecer, e só um clique deliberado no botão de confirmar envia. Duas travas, puras para testar sem tela:
 * - o botão de confirmar ignora cliques logo depois de aparecer (um duplo clique ou um Enter repetido no botão de enviar
 *   não confirma por acidente);
 * - qualquer mudança no formulário (motivo, dias, chave) desfaz a confirmação, para nunca enviar um valor que a pessoa
 *   não viu confirmado.
 */
export const CONFIRM_DELAY_MS = 300;

export type ConfirmGate = { armedAt: number | null };

export const IDLE: ConfirmGate = { armedAt: null };

/** O formulário passou na validação e mostrou a confirmação agora. */
export const arm = (now: number): ConfirmGate => ({ armedAt: now });

/** Qualquer edição, cancelamento ou erro volta ao começo. */
export const disarm = (): ConfirmGate => IDLE;

export const isArmed = (gate: ConfirmGate): boolean => gate.armedAt !== null;

/** O clique de confirmar vale só depois do atraso (um duplo clique no mesmo lugar não vale). */
export const mayConfirm = (gate: ConfirmGate, now: number): boolean =>
  gate.armedAt !== null && now - gate.armedAt >= CONFIRM_DELAY_MS;
