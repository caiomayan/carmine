import { describe, expect, it } from 'vitest';
import { playerSearchTerms } from './player-search.js';

describe('playerSearchTerms', () => {
  it('ignora maiúsculas, acentos e espaços a mais', () => {
    expect(playerSearchTerms('  AURÉLIO  ').plain).toBe('aurelio');
    expect(playerSearchTerms('Sebastião   Neto').plain).toBe('sebastiao neto');
    expect(playerSearchTerms('Ñandú').plain).toBe('nandu');
  });

  it('gera os padrões do LIKE: contém, começa com e começa uma palavra', () => {
    expect(playerSearchTerms('cold')).toMatchObject({
      contains: '%cold%',
      prefix: 'cold%',
      wordPrefix: '% cold%',
    });
  });

  it('escapa os curingas do LIKE, para "%" e "_" valerem como letra', () => {
    const terms = playerSearchTerms('a_b%c\\d');

    expect(terms.plain).toBe('a_b%c\\d');
    expect(terms.contains).toBe('%a\\_b\\%c\\\\d%');
    expect(terms.prefix).toBe('a\\_b\\%c\\\\d%');
  });
});
