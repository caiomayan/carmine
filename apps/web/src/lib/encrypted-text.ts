/**
 * A parte pura do texto que decifra (`EncryptedText`): quais letras já estão reveladas e qual
 * caractere embaralhado aparece no lugar das outras. Fica fora do componente para o teste
 * conferir a conta sem relógio nem DOM.
 */

/** Sem `I`, `l`, `O` e `0`, que se confundem com outras letras em fonte serifada. */
export const ENCRYPTED_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz123456789#%&*+=?';

/** De quanto em quanto tempo os caracteres embaralhados trocam, em ms. */
export const ENCRYPTED_FLIP_MS = 45;

/** O texto inteiro decifra em até isto, qualquer que seja o tamanho, em ms. */
export const ENCRYPTED_MAX_MS = 900;

const MIN_STEP_MS = 18;
const MAX_STEP_MS = 55;

/** Só letras e dígitos embaralham; espaço, vírgula, "#" e afins ficam no lugar. */
const SCRAMBLES = /[\p{L}\p{N}]/u;

export interface EncryptedChar {
  /** O caractere a mostrar agora. */
  char: string;
  /** O caractere final do texto, que reserva a largura do espaço. */
  original: string;
  /** Já é o caractere final (ou não tem o que embaralhar). */
  revealed: boolean;
}

/** Quanto cada letra espera para se revelar: o texto curto é mais lento, o longo não se arrasta. */
export function revealStepMs(length: number): number {
  if (length <= 0) return MAX_STEP_MS;
  return Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, ENCRYPTED_MAX_MS / length));
}

/** Quantas letras, da esquerda para a direita, já se revelaram depois de `elapsedMs`. */
export function revealedCount(elapsedMs: number, length: number, stepMs: number): number {
  return Math.min(length, Math.max(0, Math.floor(elapsedMs / Math.max(1, stepMs))));
}

/** Um quadro: as `revealed` primeiras letras como são, as demais embaralhadas. */
export function encryptedFrame(
  text: string,
  revealed: number,
  random: () => number = Math.random,
  charset: string = ENCRYPTED_CHARSET,
): EncryptedChar[] {
  return Array.from(text).map((original, index) => {
    const done = index < revealed || !SCRAMBLES.test(original);
    return {
      char: done ? original : (charset.charAt(Math.floor(random() * charset.length)) ?? original),
      original,
      revealed: done,
    };
  });
}
