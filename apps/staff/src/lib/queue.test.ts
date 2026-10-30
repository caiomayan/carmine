import { describe, expect, it } from 'vitest';
import { matchesQuery, normalize, paginate, sortCases } from './queue';

describe('busca', () => {
  it('ignora acento e caixa', () => {
    expect(normalize('Sólon ÁÉ')).toBe('solon ae');
    expect(matchesQuery('Antijogo · Retake #1', 'ANTIJOGO')).toBe(true);
  });

  it('exige todas as palavras, em qualquer ordem', () => {
    expect(matchesQuery('cheat contra rafa no de_mirage', 'mirage rafa')).toBe(true);
    expect(matchesQuery('cheat contra rafa no de_mirage', 'mirage bruna')).toBe(false);
  });

  it('busca vazia casa com tudo', () => {
    expect(matchesQuery('qualquer coisa', '   ')).toBe(true);
  });
});

describe('ordenação', () => {
  type Item = { id: string; deadline: number | null; count: number };
  const items: Item[] = [
    { id: 'a', deadline: 30, count: 1 },
    { id: 'b', deadline: null, count: 4 },
    { id: 'c', deadline: 10, count: 2 },
    { id: 'd', deadline: 20, count: 2 },
  ];
  const value = (item: Item, key: 'deadline' | 'count') => item[key];
  const ids = (list: Item[]) => list.map((item) => item.id).join('');

  it('o prazo mais perto de vencer primeiro, e o caso sem prazo sempre no fim', () => {
    expect(ids(sortCases(items, value, { key: 'deadline', dir: 1 }))).toBe('cdab');
    expect(ids(sortCases(items, value, { key: 'deadline', dir: -1 }))).toBe('adcb');
  });

  it('o desempate é a ordem em que a API mandou', () => {
    expect(ids(sortCases(items, value, { key: 'count', dir: -1 }))).toBe('bcda');
    expect(ids(sortCases(items, value, { key: 'count', dir: 1 }))).toBe('acdb');
  });

  it('não muda a lista de entrada', () => {
    const before = ids(items);
    sortCases(items, value, { key: 'deadline', dir: 1 });
    expect(ids(items)).toBe(before);
  });
});

describe('paginação', () => {
  const list = Array.from({ length: 23 }, (_, index) => index + 1);

  it('divide em páginas e diz o intervalo', () => {
    const second = paginate(list, 1, 10);
    expect(second.slice[0]).toBe(11);
    expect(second.pages).toBe(3);
    expect([second.from, second.to, second.total]).toEqual([11, 20, 23]);
    expect(paginate(list, 2, 10).slice).toHaveLength(3);
  });

  it('encolhe a página que passou do fim (depois de um filtro) e aguenta a lista vazia', () => {
    expect(paginate(list.slice(0, 5), 4, 10).page).toBe(0);
    const empty = paginate([], 0, 10);
    expect([empty.from, empty.to, empty.pages]).toEqual([0, 0, 1]);
  });
});
