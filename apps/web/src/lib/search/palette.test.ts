import { describe, expect, it } from 'vitest';
import {
  GROUP_LIMIT,
  groupResults,
  type Hit,
  type PaletteGroup,
  rankStatic,
  scoreServer,
} from './palette';

const hit = (group: PaletteGroup, key: string, score: number): Hit<string> => ({
  group,
  score,
  item: key,
});

describe('rankStatic', () => {
  const entries = [
    { id: 'servers', label: 'Servidores', keywords: ['servers', 'jogar'] },
    { id: 'inventory', label: 'Inventário', keywords: ['inventory', 'skins'] },
    { id: 'ranking', label: 'Ranking', keywords: ['placar', 'leaderboard'] },
  ];

  it('acha pelo rótulo, sem acento e com palavra parcial', () => {
    expect(rankStatic(entries, 'inventar').map((s) => s.item.id)).toEqual(['inventory']);
    expect(rankStatic(entries, 'INVENTARIO').map((s) => s.item.id)).toEqual(['inventory']);
    expect(rankStatic(entries, 'rank').map((s) => s.item.id)).toEqual(['ranking']);
  });

  it('acha pelas palavras-chave nos dois idiomas', () => {
    expect(rankStatic(entries, 'servers').map((s) => s.item.id)).toEqual(['servers']);
    expect(rankStatic(entries, 'leaderboard').map((s) => s.item.id)).toEqual(['ranking']);
  });

  it('aceita erro de digitação', () => {
    expect(rankStatic(entries, 'rankign').map((s) => s.item.id)).toEqual(['ranking']);
  });

  it('o rótulo vale mais que a palavra-chave solta', () => {
    const list = [
      { id: 'a', label: 'Loadout', keywords: ['rank'] },
      { id: 'b', label: 'Ranking', keywords: [] },
    ];

    expect(rankStatic(list, 'rank').map((s) => s.item.id)).toEqual(['b', 'a']);
  });

  it('sem busca devolve tudo, na ordem em que vieram', () => {
    expect(rankStatic(entries, '').map((s) => s.item.id)).toEqual([
      'servers',
      'inventory',
      'ranking',
    ]);
    expect(rankStatic(entries, '   ')).toHaveLength(3);
  });

  it('descarta o que não casa', () => {
    expect(rankStatic(entries, 'zzzz')).toEqual([]);
  });
});

describe('scoreServer', () => {
  const server = {
    name: 'retake-1',
    showcaseName: 'Retake · Rotação',
    map: 'de_mirage',
    code: 'SP·1',
  };

  it('acha pelo nome, pelo nome de vitrine e pelo mapa', () => {
    expect(scoreServer(server, 'retake')).toBeGreaterThan(0);
    expect(scoreServer(server, 'rotacao')).toBeGreaterThan(0);
    expect(scoreServer(server, 'mirage')).toBeGreaterThan(0);
    expect(scoreServer(server, 'inferno')).toBe(0);
  });

  it('serve com servidor sem mapa (offline) e sem nome de vitrine', () => {
    expect(
      scoreServer({ name: 'dm-2', showcaseName: null, map: null, code: null }, 'dm'),
    ).toBeGreaterThan(0);
  });
});

describe('groupResults', () => {
  it('agrupa por tipo e ordena os grupos pelo melhor acerto de cada um', () => {
    const groups = groupResults([
      hit('catalog', 'AK-47', 0.8),
      hit('pages', 'Ranking', 1.3),
      hit('catalog', 'AK-47 Redline', 0.95),
      hit('players', 'Aurélio', 0.7),
    ]);

    expect(groups.map((g) => g.group)).toEqual(['pages', 'catalog', 'players']);
  });

  it('dentro do grupo, do mais para o menos relevante, mantendo a ordem no empate', () => {
    const [group] = groupResults([
      hit('catalog', 'b', 0.5),
      hit('catalog', 'a', 0.9),
      hit('catalog', 'c', 0.5),
    ]);

    expect(group?.hits.map((h) => h.item)).toEqual(['a', 'b', 'c']);
  });

  it('no empate entre grupos vale a ordem fixa: páginas, ações, inventário, catálogo, jogadores, servidores', () => {
    const groups = groupResults([
      hit('servers', 's', 1),
      hit('players', 'p', 1),
      hit('catalog', 'c', 1),
      hit('inventory', 'i', 1),
      hit('actions', 'a', 1),
      hit('pages', 'g', 1),
    ]);

    expect(groups.map((g) => g.group)).toEqual([
      'pages',
      'actions',
      'inventory',
      'catalog',
      'players',
      'servers',
    ]);
  });

  it('limita cada grupo', () => {
    const many = Array.from({ length: 20 }, (_, i) => hit('catalog', `item-${i}`, 1 - i / 100));

    const [group] = groupResults(many);

    expect(group?.hits).toHaveLength(GROUP_LIMIT.catalog);
    expect(group?.hits[0]?.item).toBe('item-0');
  });

  it('as páginas cabem todas no grupo (a lista sem busca é o menu do site)', () => {
    const pages = Array.from({ length: 7 }, (_, i) => hit('pages', `p${i}`, 1));

    expect(groupResults(pages)[0]?.hits).toHaveLength(7);
  });

  it('sem nada, nenhum grupo', () => {
    expect(groupResults([])).toEqual([]);
  });
});
