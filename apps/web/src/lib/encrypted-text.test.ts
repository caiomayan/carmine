import { describe, expect, it } from 'vitest';
import {
  ENCRYPTED_CHARSET,
  ENCRYPTED_MAX_MS,
  encryptedFrame,
  revealedCount,
  revealStepMs,
} from './encrypted-text';

const sequence = (values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length] ?? 0;
};

describe('revealStepMs', () => {
  it('texto curto é mais lento, mas nunca passa de 55 ms por letra', () => {
    expect(revealStepMs(3)).toBe(55);
    expect(revealStepMs(0)).toBe(55);
  });

  it('o texto inteiro decifra em até o teto, até em textos longos', () => {
    for (const length of [8, 15, 21, 32, 60]) {
      expect(revealStepMs(length) * length).toBeLessThanOrEqual(
        Math.max(ENCRYPTED_MAX_MS, 18 * length),
      );
    }
    expect(revealStepMs(21) * 21).toBeCloseTo(ENCRYPTED_MAX_MS);
  });

  it('textos muito longos têm o piso de 18 ms por letra', () => {
    expect(revealStepMs(500)).toBe(18);
  });
});

describe('revealedCount', () => {
  it('revela da esquerda para a direita, uma letra por passo', () => {
    expect(revealedCount(0, 10, 40)).toBe(0);
    expect(revealedCount(39, 10, 40)).toBe(0);
    expect(revealedCount(40, 10, 40)).toBe(1);
    expect(revealedCount(125, 10, 40)).toBe(3);
  });

  it('não passa do tamanho do texto nem fica negativa', () => {
    expect(revealedCount(10_000, 10, 40)).toBe(10);
    expect(revealedCount(-50, 10, 40)).toBe(0);
  });
});

describe('encryptedFrame', () => {
  it('com nada revelado, troca letras e dígitos e deixa espaço e pontuação', () => {
    const frame = encryptedFrame('Erro 404, ok', 0, sequence([0, 0.5, 0.99]));
    expect(frame.map((entry) => entry.original).join('')).toBe('Erro 404, ok');
    for (const entry of frame) {
      if (/[\p{L}\p{N}]/u.test(entry.original)) {
        expect(entry.revealed).toBe(false);
        expect(ENCRYPTED_CHARSET).toContain(entry.char);
      } else {
        expect(entry.revealed).toBe(true);
        expect(entry.char).toBe(entry.original);
      }
    }
  });

  it('as letras reveladas voltam a ser as originais', () => {
    const frame = encryptedFrame('Alfredo', 3, () => 0);
    expect(frame.slice(0, 3).map((entry) => entry.char)).toEqual(['A', 'l', 'f']);
    expect(frame.slice(3).every((entry) => !entry.revealed)).toBe(true);
  });

  it('tudo revelado é o texto original', () => {
    const frame = encryptedFrame('João da Silva', 99, Math.random);
    expect(frame.map((entry) => entry.char).join('')).toBe('João da Silva');
    expect(frame.every((entry) => entry.revealed)).toBe(true);
  });

  it('conta caracteres acentuados como um só, e não como dois', () => {
    expect(encryptedFrame('Página', 0)).toHaveLength(6);
  });

  it('texto vazio não gera quadro', () => {
    expect(encryptedFrame('', 0)).toEqual([]);
  });
});
