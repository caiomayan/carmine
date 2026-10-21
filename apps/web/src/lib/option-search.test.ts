import { describe, expect, it } from 'vitest';
import {
  editDistance,
  indexText,
  matchesSearch,
  normalizeSearch,
  scoreDoc,
  searchScore,
} from './option-search';

describe('normalizeSearch', () => {
  it('ignora maiúsculas, acentos e espaços nas pontas', () => {
    expect(normalizeSearch('  Coleção ÁGUA  ')).toBe('colecao agua');
  });

  it('pontuação vira espaço: "|", "★" e hífen não são palavras', () => {
    expect(normalizeSearch('★ AK-47 | Linhas Vermelhas')).toBe('ak 47 linhas vermelhas');
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

describe('editDistance (Damerau-Levenshtein por transposição adjacente)', () => {
  it('conta troca, inserção, remoção e transposição como 1', () => {
    expect(editDistance('karambit', 'karambit')).toBe(0);
    expect(editDistance('karambti', 'karambit')).toBe(1);
    expect(editDistance('karambt', 'karambit')).toBe(1);
    expect(editDistance('kerambit', 'karambit')).toBe(1);
    expect(editDistance('karambbit', 'karambit')).toBe(1);
    expect(editDistance('abc', 'xyz')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('busca tolerante', () => {
  it('acha com palavra parcial e com erro de digitação', () => {
    expect(matchesSearch('AK-47 | Redline', 'ak redlin')).toBe(true);
    expect(matchesSearch('★ Karambit | Doppler', 'karambti')).toBe(true);
    expect(matchesSearch('M4A1-S | Hyper Beast', 'm4 hyper')).toBe(true);
    expect(matchesSearch('M4A1-S | Hyper Beast', 'hyperr beast')).toBe(true);
  });

  it('acha o código colado ("ak47" em "AK-47") e separado', () => {
    expect(matchesSearch('AK-47 | Redline', 'ak47')).toBe(true);
    expect(matchesSearch('AK-47 | Redline', 'ak 47 redline')).toBe(true);
  });

  it('a tolerância cresce com o tamanho da palavra: palavra curta é exata', () => {
    expect(matchesSearch('AWP | Asiimov', 'awq')).toBe(false);
    expect(matchesSearch('AWP | Asiimov', 'asimov')).toBe(true);
    expect(matchesSearch('Desert Eagle', 'desert egle')).toBe(true);
    expect(matchesSearch('Desert Eagle', 'dezert egle')).toBe(true);
    // 4 a 7 letras: 1 erro; 2 erros só de 8 em diante.
    expect(matchesSearch('Bayonet', 'bxyonet')).toBe(true);
    expect(matchesSearch('Bayonet', 'bxyxnet')).toBe(false);
    expect(matchesSearch('Karambit', 'kxrxmbit')).toBe(true);
  });

  it('não devolve lixo: palavras sem relação não casam', () => {
    expect(matchesSearch('AK-47 | Redline', 'm4 hyper')).toBe(false);
    expect(matchesSearch('AK-47 | Redline', 'ak zzzz')).toBe(false);
    expect(matchesSearch('Glock-18 | Fade', 'nada disso existe')).toBe(false);
  });
});

describe('relevância: exato, depois prefixo, depois trecho, depois aproximado', () => {
  const score = (text: string, query: string) => searchScore(text, query);

  it('palavra exata vale mais que prefixo, que vale mais que trecho, que vale mais que erro', () => {
    const exact = score('Bayonet', 'bayonet');
    const prefix = score('Bayonetta', 'bayonet');
    const middle = score('Subayonet', 'bayonet');
    const typo = score('Bayoneu', 'bayonet');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(0);
  });

  it('o prefixo mais próximo do tamanho da palavra vale mais', () => {
    expect(score('Karambit', 'karamb')).toBeGreaterThan(score('Karambitoides', 'karamb'));
  });

  it('o nome inteiro igual ou começando pela busca ganha desempate', () => {
    expect(score('AK-47', 'ak 47')).toBeGreaterThan(score('Skin do AK-47', 'ak 47'));
  });

  it('o que só casa no texto secundário vale um pouco menos', () => {
    const inName = scoreDoc(indexText('Faca Karambit', 'faca knife'), 'karambit');
    const inExtra = scoreDoc(indexText('Faca Karambit', 'faca knife'), 'knife');
    expect(inName).toBeGreaterThan(inExtra);
    expect(inExtra).toBeGreaterThan(0);
  });

  it('zero é "não casa"; busca vazia não pontua nem filtra', () => {
    expect(score('AK-47', 'awp')).toBe(0);
    expect(scoreDoc(indexText('AK-47'), '')).toBeGreaterThan(0);
  });
});
