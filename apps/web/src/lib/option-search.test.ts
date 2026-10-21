import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearch } from './option-search';

describe('normalizeSearch', () => {
  it('ignora maiúsculas, acentos e espaços nas pontas', () => {
    expect(normalizeSearch('  Coleção ÁGUA  ')).toBe('colecao agua');
  });
});

describe('matchesSearch', () => {
  it('uma busca vazia aceita tudo', () => {
    expect(matchesSearch('AK-47', '')).toBe(true);
    expect(matchesSearch('AK-47', '   ')).toBe(true);
  });

  it('acha por trecho, sem diferenciar maiúsculas nem acentos', () => {
    expect(matchesSearch('Coleção Kilowatt', 'colecao')).toBe(true);
    expect(matchesSearch('Coleção Kilowatt', 'WATT')).toBe(true);
    expect(matchesSearch('Coleção Kilowatt', 'dust')).toBe(false);
  });

  it('todas as palavras da busca precisam aparecer, em qualquer ordem', () => {
    expect(matchesSearch('The Anubis Collection', 'collection anubis')).toBe(true);
    expect(matchesSearch('The Anubis Collection', 'anubis dust')).toBe(false);
  });

  it('hífen e espaço contam como o mesmo separador', () => {
    expect(matchesSearch('AK-47', 'ak 47')).toBe(true);
    expect(matchesSearch('SSG 08', 'ssg-08')).toBe(true);
  });
});
