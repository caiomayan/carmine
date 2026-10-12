import { describe, expect, it } from 'vitest';
import { displayNameFor } from './display-name.js';

describe('displayNameFor', () => {
  it('usa o nome Steam quando ele passa no filtro', () => {
    expect(displayNameFor('coldzera', 10_016)).toBe('coldzera');
  });

  it('mostra "Jogador #ID" quando o nome Steam é ofensivo', () => {
    expect(displayNameFor('Filho da Puta', 10_016)).toBe('Jogador #10016');
  });

  it('remove caracteres de controle e espaços sobrando', () => {
    expect(displayNameFor('  João\u0000​   Vitor \n', 10_016)).toBe('João Vitor');
  });

  it('mostra "Jogador #ID" quando não sobra nada do nome', () => {
    expect(displayNameFor(' ​\t', 12_345)).toBe('Jogador #12345');
  });

  it('corta nomes acima de 32 caracteres (limite da Steam)', () => {
    expect(displayNameFor('a'.repeat(40), 10_016)).toBe('a'.repeat(32));
  });

  it('mostra "Jogador #ID" enquanto o nome Steam for o que a Staff resetou', () => {
    expect(displayNameFor('nome ruim', 10_016, 'nome ruim')).toBe('Jogador #10016');
    expect(displayNameFor('nome novo', 10_016, 'nome ruim')).toBe('nome novo');
  });
});
