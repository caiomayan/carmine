import { describe, expect, it } from 'vitest';
import { allocatePublicId, isPrettyNumber, publicIdFor } from './public-id.js';

describe('publicIdFor', () => {
  it('coloca cada valor do contador num bloco exclusivo de 3 a partir de 10.000', () => {
    expect(publicIdFor(0, 0)).toBe(10_000);
    expect(publicIdFor(0, 2)).toBe(10_002);
    expect(publicIdFor(5, 1)).toBe(10_016);
    expect(publicIdFor(1_000, 2)).toBe(13_002);
  });

  it('é sempre crescente: o maior sorteio de n perde para o menor de n + 1', () => {
    expect(publicIdFor(5, 2)).toBe(10_017);
    expect(publicIdFor(6, 0)).toBe(10_018);
  });

  it('não tem teto de dígitos', () => {
    expect(publicIdFor(10_000_000, 0)).toBe(30_010_000);
  });

  it('recusa sorteio fora de 0..2 e contador negativo', () => {
    expect(() => publicIdFor(1, 3)).toThrow();
    expect(() => publicIdFor(-1, 0)).toThrow();
  });
});

describe('isPrettyNumber', () => {
  it.each([
    [11_111, 'repetido'],
    [777_777, 'repetido'],
    [12_321, 'palíndromo'],
    [10_001, 'palíndromo'],
    [12_345, 'sequência crescente'],
    [98_765, 'sequência decrescente'],
    [20_000, 'redondo'],
    [31_000, 'redondo'],
    [123_123, 'bloco repetido'],
    [121_212, 'bloco repetido'],
    [69_420, 'meme'],
    [31_337, 'meme'],
  ])('bloqueia %i (%s)', (id) => {
    expect(isPrettyNumber(id)).toBe(true);
  });

  it.each([10_002, 10_004, 13_002, 48_213, 12_346, 31_001, 30_010_000 + 7])('libera %i', (id) => {
    expect(isPrettyNumber(id)).toBe(false);
  });
});

describe('allocatePublicId', () => {
  const counter = (...values: number[]) => {
    const queue = [...values];
    return async () => {
      const next = queue.shift();
      if (next === undefined) throw new Error('contador esgotado no teste');
      return next;
    };
  };

  it('usa o valor do contador com o sorteio', async () => {
    const id = await allocatePublicId(counter(7), () => 1);

    expect(id).toBe(10_022);
  });

  it('pula para o próximo n quando o sorteio cai num número bonito', async () => {
    // n = 0 com sorteio 1 dá 10.001 (palíndromo); n = 1 com sorteio 1 dá 10.004.
    const id = await allocatePublicId(counter(0, 1), () => 1);

    expect(id).toBe(10_004);
  });
});
