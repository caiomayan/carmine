import { describe, expect, it } from 'vitest';
import { chosenSelectValue, EMPTY_SELECT_VALUE } from './select-value';

describe('chosenSelectValue', () => {
  it('repassa o valor de uma opção', () => {
    expect(chosenSelectValue('ct')).toBe('ct');
    expect(chosenSelectValue('0')).toBe('0');
  });

  it('o item "vazio" desfaz a escolha: vira a string vazia', () => {
    expect(chosenSelectValue(EMPTY_SELECT_VALUE)).toBe('');
  });

  it('o aviso vazio do Radix (valor ainda sem item montado) não é uma escolha', () => {
    expect(chosenSelectValue('')).toBeNull();
  });
});
