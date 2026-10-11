import { describe, expect, it } from 'vitest';
import { formatDecimal, parseDecimal } from './decimal';

describe('números decimais digitados', () => {
  it('aceita vírgula ou ponto', () => {
    expect(parseDecimal('0,15')).toBe(0.15);
    expect(parseDecimal('0.15')).toBe(0.15);
    expect(parseDecimal(' 661 ')).toBe(661);
    expect(parseDecimal(',5')).toBe(0.5);
    expect(parseDecimal('-12,5')).toBe(-12.5);
  });

  it('recusa o que não é número', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1,2,3')).toBeNull();
    expect(parseDecimal('1e3')).toBeNull();
  });
});

describe('formatação', () => {
  it('usa vírgula e o número de casas pedido, sem zeros sobrando', () => {
    expect(formatDecimal(0.15, 6)).toBe('0,15');
    expect(formatDecimal(0.1234567, 6)).toBe('0,123457');
    expect(formatDecimal(661, 0)).toBe('661');
    expect(formatDecimal(0.07, 2, { fixed: true })).toBe('0,07');
    expect(formatDecimal(0.1, 4, { fixed: true })).toBe('0,1000');
  });
});
