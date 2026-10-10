import { describe, expect, it } from 'vitest';
import { isOffensiveName } from './name-filter.js';

describe('isOffensiveName', () => {
  it.each([
    ['puta', 'palavrão PT-BR'],
    ['Filho da Puta', 'expressão PT-BR'],
    ['fdp', 'sigla PT-BR'],
    ['CARALHO', 'maiúsculas'],
    ['caralhoooo', 'letras repetidas'],
    ['pu7a', 'leetspeak'],
    ['p.u.t.a', 'letras separadas por ponto'],
    ['p u t a', 'letras separadas por espaço'],
    ['vi4d0', 'leetspeak com zero'],
    ['arrombadão', 'acento'],
    ['xXcaralhoXx', 'termo forte dentro de outra palavra'],
    ['fdp123', 'número colado no fim'],
    ['fuck', 'palavrão EN'],
    ['MotherFucker', 'termo forte EN dentro de palavra'],
    ['n1gg3r', 'ofensa racial em leetspeak'],
    ['b1tch', 'leetspeak com 1 como i'],
    ['sh!t', 'símbolo como letra'],
    ['ｐｕｔａ', 'caracteres de largura total'],
    ['рuta', 'p cirílico'],
    ['Heil Hitler', 'apologia ao nazismo'],
  ])('reprova "%s" (%s)', (name) => {
    expect(isOffensiveName(name)).toBe(true);
  });

  it.each([
    'Gabriel',
    'João Vitor',
    'computador',
    'enviado',
    'Scunthorpe',
    'Assis',
    'cucumber',
    'Glasses',
    'kkkkkk',
    'S1mple',
    'coldzera',
    'Puttanesca',
    'Niger',
    'Sem Nome 2004',
    '★ Ninja ★',
  ])('aprova "%s"', (name) => {
    expect(isOffensiveName(name)).toBe(false);
  });
});
