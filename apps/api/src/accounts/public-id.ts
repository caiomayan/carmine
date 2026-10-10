/**
 * ID público da Conta (ADR 0013). De 1 a 9.999 são IDs reservados, atribuídos pela Staff; as
 * Contas novas recebem `10.000 + n × 3 + sorteio(0..2)`, com `n` de um contador monotônico.
 * Cada `n` tem um bloco exclusivo de 3 números, então o ID nunca colide e é sempre crescente.
 */
export const FIRST_AUTOMATIC_PUBLIC_ID = 10_000;
const BLOCK_SIZE = 3;

export type BlockDraw = 0 | 1 | 2;

export function publicIdFor(counter: number, draw: number): number {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new RangeError(`contador inválido: ${counter}`);
  }
  if (!Number.isInteger(draw) || draw < 0 || draw >= BLOCK_SIZE) {
    throw new RangeError(`sorteio fora de 0..2: ${draw}`);
  }
  return FIRST_AUTOMATIC_PUBLIC_ID + counter * BLOCK_SIZE + draw;
}

/** Números famosos que não seguem nenhum padrão abaixo. */
const MEME_NUMBERS = new Set([13_337, 31_337, 42_069, 58_008, 69_069, 69_420, 80_085]);

/**
 * Números bonitos ficam fora da atribuição automática (lista de bloqueio do ADR 0013), para a
 * Staff poder atribuí-los à mão: palíndromos (12321, 10001, 77777), um bloco repetido (123123,
 * 121212), três ou mais zeros no fim (20000, 31000), sequências de dígitos consecutivos
 * (12345, 98765) e números de meme.
 */
export function isPrettyNumber(id: number): boolean {
  const digits = String(id);
  return (
    isPalindrome(digits) ||
    isRepeatedBlock(digits) ||
    /000$/.test(digits) ||
    isConsecutiveRun(digits) ||
    MEME_NUMBERS.has(id)
  );
}

function isPalindrome(digits: string): boolean {
  return digits === [...digits].reverse().join('');
}

function isRepeatedBlock(digits: string): boolean {
  for (let size = 1; size <= digits.length / 2; size++) {
    if (
      digits.length % size === 0 &&
      digits.slice(0, size).repeat(digits.length / size) === digits
    ) {
      return true;
    }
  }
  return false;
}

function isConsecutiveRun(digits: string): boolean {
  const steps = new Set<number>();
  for (let i = 1; i < digits.length; i++) {
    steps.add(Number(digits[i]) - Number(digits[i - 1]));
  }
  return steps.size === 1 && (steps.has(1) || steps.has(-1));
}

/**
 * Sorteia o ID público de uma Conta nova. Cada chamada a `nextCounter` deve devolver um `n`
 * inédito (a sequência do Postgres garante isso sob connects simultâneos); quando o número
 * sorteado é bonito, o bloco inteiro é descartado e o próximo `n` é usado.
 */
export async function allocatePublicId(
  nextCounter: () => Promise<number>,
  draw: () => BlockDraw,
): Promise<number> {
  for (;;) {
    const id = publicIdFor(await nextCounter(), draw());
    if (!isPrettyNumber(id)) {
      return id;
    }
  }
}
