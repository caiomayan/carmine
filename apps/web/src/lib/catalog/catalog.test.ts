import { describe, expect, it } from 'vitest';
import { matchesSearch } from '../option-search';
import {
  CATALOG_PAGE_SIZE,
  catalogEntry,
  catalogIndex,
  itemSpec,
  parseCatalogFilters,
  quickSearchCatalog,
  quickSearchOwned,
  searchAttachments,
  searchCatalog,
} from './catalog';
import { ATTACHMENTS_PAYLOAD_VERSION, type FacetOption } from './types';

// Ids da @ianlucas/cs2-lib 9.5.0 (fixada no package.json).
const DEAGLE_DEFAULT = 0;
const CT_DEFAULT_KNIFE = 35;
const KARAMBIT_VANILLA = 41;
const AK_REDLINE = 222;
const AK_FIRE_SERPENT = 220;
const AWP_ASIIMOV = 306;
const FIRST_AGENT = 8620;
const BROKEN_FANG_GLOVES_BASE = 56;
const FIRST_STICKER = 1847;

const ids = (result: { items: { id: number }[] }) => result.items.map((item) => item.id);

describe('índice do catálogo', () => {
  const index = catalogIndex();

  it('não tem Armas padrão nem as facas padrão', () => {
    expect(catalogEntry(DEAGLE_DEFAULT)).toBeUndefined();
    expect(catalogEntry(CT_DEFAULT_KNIFE)).toBeUndefined();
    expect(index.some((entry) => entry.id === DEAGLE_DEFAULT)).toBe(false);
  });

  it('tem a faca sem pintura (ela é um Item de verdade no jogo)', () => {
    expect(catalogEntry(KARAMBIT_VANILLA)).toMatchObject({ type: 'knife', name: 'Karambit' });
  });

  it('não tem luvas base (não são Itens)', () => {
    expect(catalogEntry(BROKEN_FANG_GLOVES_BASE)).toBeUndefined();
  });

  it('só tem os tipos que são Itens: stickers e charms ficam de fora', () => {
    const types = new Set(index.map((entry) => entry.type));
    expect([...types].sort()).toEqual(['agent', 'glove', 'knife', 'musickit', 'weapon']);
    expect(catalogEntry(FIRST_STICKER)).toBeUndefined();
  });

  it('usa os nomes em PT-BR da lib, separando a arma do nome da skin', () => {
    expect(catalogEntry(AK_REDLINE)).toMatchObject({
      name: 'AK-47 | Linhas Vermelhas',
      weapon: 'AK-47',
      skin: 'Linhas Vermelhas',
      type: 'weapon',
      rarity: 'classified',
      image: expect.stringMatching(/^https:\/\/cdn\.cstrike\.app\/images\/.+\.webp$/),
    });
  });

  it('marca agentes e music kits como exclusivos do VIP', () => {
    expect(catalogEntry(FIRST_AGENT)?.vip).toBe(true);
    expect(index.find((entry) => entry.type === 'musickit')?.vip).toBe(true);
    expect(catalogEntry(AK_REDLINE)?.vip).toBe(false);
  });
});

describe('busca no catálogo', () => {
  it('ignora acentos e caixa e aceita várias palavras em qualquer ordem', () => {
    expect(ids(searchCatalog({ q: 'LINHAS vermelhas' }))).toContain(AK_REDLINE);
    // Com a busca tolerante outras skins parecidas também entram; a exata vem primeiro.
    expect(ids(searchCatalog({ q: 'vermelhas ak' }))[0]).toBe(AK_REDLINE);
    expect(ids(searchCatalog({ q: 'serpênte' }))).toContain(AK_FIRE_SERPENT);
  });

  it('filtra por tipo, arma, raridade e coleção juntos', () => {
    const ak = searchCatalog({ type: 'weapon', weapon: 'AK-47', limit: 1000 });
    expect(ak.total).toBeGreaterThan(20);
    expect(ak.items.every((entry) => entry.weapon === 'AK-47')).toBe(true);

    const classifiedAk = searchCatalog({ type: 'weapon', weapon: 'AK-47', rarity: 'classified' });
    expect(classifiedAk.items.every((entry) => entry.rarity === 'classified')).toBe(true);
    expect(ids(classifiedAk)).toContain(AK_REDLINE);

    const collection = catalogEntry(AWP_ASIIMOV)?.collection ?? undefined;
    expect(collection).toBeTruthy();
    const phoenix = searchCatalog({ collection, limit: 1000 });
    expect(ids(phoenix)).toContain(AWP_ASIIMOV);
    expect(phoenix.items.every((entry) => entry.collection === collection)).toBe(true);
  });

  it('pagina e conta o total', () => {
    const page = searchCatalog({ type: 'weapon' });
    expect(page.items).toHaveLength(CATALOG_PAGE_SIZE);
    expect(page.total).toBeGreaterThan(CATALOG_PAGE_SIZE);
  });

  it('devolve vazio (não erro) quando nada combina', () => {
    expect(searchCatalog({ q: 'zzzz-nada-disso' })).toMatchObject({ items: [], total: 0 });
  });

  it('oferece as armas e as coleções do tipo escolhido como opções de filtro', () => {
    const { facets } = searchCatalog({ type: 'weapon' });
    const weapons = facets.weapons.map((option) => option.value);
    expect(weapons).toContain('AK-47');
    expect(weapons).not.toContain('Karambit');
    expect(facets.collections.length).toBeGreaterThan(10);
    expect(searchCatalog({ type: 'knife' }).facets.weapons.map((option) => option.value)).toContain(
      'Karambit',
    );
  });
});

/** Como o Combobox acha uma opção: o rótulo e os outros nomes dela. */
const found = (options: FacetOption[], query: string) =>
  options.filter((option) => matchesSearch([option.label, ...option.keywords], query));

describe('opções dos filtros de Arma e Coleção: PT-BR e inglês', () => {
  const weapons = searchCatalog({}).facets.weapons;
  const knives = searchCatalog({ type: 'knife' }).facets.weapons;

  it('"knife" acha todas as facas na Arma, e "faca" também; "luvas" e "gloves", as luvas', () => {
    expect(found(knives, 'knife')).toHaveLength(knives.length);
    expect(found(knives, 'faca').length).toBeGreaterThan(10);
    expect(found(weapons, 'knife').map((o) => o.value)).toContain('Karambit');
    expect(found(weapons, 'gloves').map((o) => o.label)).toContain('Luvas da Hidra');
    expect(found(weapons, 'luvas').map((o) => o.label)).toContain('Luvas da Hidra');
    // Arma de fogo não é faca.
    expect(found(weapons, 'knife').map((o) => o.value)).not.toContain('AK-47');
  });

  it('acha a arma pelo nome original em inglês quando o PT-BR é outro', () => {
    expect(found(weapons, 'dual berettas').map((o) => o.value)).toEqual(['Berettas Duplas']);
    expect(found(weapons, 'sawed off').map((o) => o.value)).toContain('Cano Curto');
    expect(found(weapons, 'butterfly').map((o) => o.value)).toEqual(['Canivete Borboleta']);
  });

  it('"a1 m4" acha a M4A1-S, em qualquer ordem', () => {
    expect(found(weapons, 'a1 m4').map((o) => o.value)).toEqual(['M4A1-S']);
    expect(found(weapons, 'm4 a1').map((o) => o.value)).toEqual(['M4A1-S']);
    expect(found(weapons, 'm4').map((o) => o.value)).toEqual(
      expect.arrayContaining(['M4A1-S', 'M4A4']),
    );
  });

  it('a Coleção acha sem acento, por palavra parcial, com erro e pelo nome em inglês', () => {
    const collections = searchCatalog({}).facets.collections;
    const names = (query: string) => found(collections, query).map((o) => o.value);
    expect(names('colecao')).toEqual(
      collections.filter((o) => o.value.includes('Coleção')).map((o) => o.value),
    );
    // "Quilowatt" em PT-BR, "Kilowatt" em inglês.
    expect(names('kilowatt')).toEqual(['A Coleção Quilowatt']);
    expect(names('quilowat')).toEqual(['A Coleção Quilowatt']);
    expect(names('quilowatt colecao')).toEqual(['A Coleção Quilowatt']);
    expect(names('kilowtat')).toEqual(['A Coleção Quilowatt']);
    expect(names('anubis')).toEqual(['A Coleção Anubis']);
    expect(names('dust 2 2021')).toEqual(['A Coleção Dust 2 de 2021']);
    expect(names('zzzzzz')).toEqual([]);
  });

  it('a categoria de sticker acha pelo nome em inglês e nunca vira chave crua', () => {
    const { categories } = searchAttachments('sticker', { limit: 1 }).facets;
    expect(
      categories.every((c) => c.value === c.label && !c.keywords.some((k) => k.startsWith('#'))),
    ).toBe(true);
    expect(found(categories, 'dreamhack winter 2013').map((c) => c.value)).toContain(
      'DreamHack Winter 2013',
    );
    expect(found(categories, 'antuerpia').length).toBeGreaterThan(0);
  });
});

describe('busca tolerante no catálogo (Q16)', () => {
  it('acha com palavra parcial e com erro de digitação', () => {
    expect(ids(searchCatalog({ q: 'ak redlin' }))).toContain(AK_REDLINE);
    expect(searchCatalog({ q: 'karambti' }).items.some((e) => e.weapon === 'Karambit')).toBe(true);
    const hyper = searchCatalog({ q: 'm4 hyper' }).items;
    expect(hyper.length).toBeGreaterThan(0);
    expect(hyper.every((e) => e.weapon === 'M4A1-S' || e.weapon === 'M4A4')).toBe(true);
  });

  it('acha pelo nome original em inglês, além do PT-BR da lib', () => {
    // "Linhas Vermelhas" em PT-BR; "Redline" no original.
    expect(catalogEntry(AK_REDLINE)?.name).toBe('AK-47 | Linhas Vermelhas');
    expect(ids(searchCatalog({ q: 'redline' }))).toContain(AK_REDLINE);
    expect(ids(searchCatalog({ q: 'ak47 redline' }))).toContain(AK_REDLINE);
    expect(ids(searchCatalog({ q: 'asiimov awp' }))).toContain(AWP_ASIIMOV);
  });

  it('"knife" acha as facas e "gloves" acha as luvas, em qualquer idioma do tipo', () => {
    // Outras coisas podem entrar (skins da "Coleção Luvas"), mas todas as facas e luvas vêm antes.
    const countOf = (type: 'knife' | 'glove') =>
      catalogIndex().filter((e) => e.type === type).length;
    for (const [q, type, pt] of [
      ['knife', 'knife', 'faca'],
      ['gloves', 'glove', 'luvas'],
    ] as const) {
      const found = searchCatalog({ q, limit: 100000 });
      // A página vai até CATALOG_PAGE_SIZE × 10 itens.
      const count = Math.min(countOf(type), CATALOG_PAGE_SIZE * 10);
      expect(count).toBeGreaterThan(50);
      expect(found.items.slice(0, count).every((e) => e.type === type)).toBe(true);
      // O nome do tipo em português acha o mesmo conjunto.
      const portuguese = searchCatalog({ q: pt, limit: 100000 });
      expect(
        portuguese.items
          .slice(0, count)
          .map((e) => e.id)
          .sort(),
      ).toEqual(
        found.items
          .slice(0, count)
          .map((e) => e.id)
          .sort(),
      );
    }
  });

  it('o tipo combina com o nome: "knife karambit" traz só as Karambit', () => {
    const found = searchCatalog({ q: 'knife karambit' }).items;
    expect(found.length).toBeGreaterThan(5);
    expect(found.every((e) => e.type === 'knife' && e.weapon === 'Karambit')).toBe(true);
  });

  it('ordena por relevância: o nome exato vem antes do aproximado', () => {
    // Vários itens têm "karambit" no nome; a faca sem pintura é a que é só "Karambit".
    expect(searchCatalog({ q: 'karambit' }).items[0]?.id).toBe(KARAMBIT_VANILLA);
    // Com erro de digitação, o que casa de verdade ainda vem primeiro.
    expect(searchCatalog({ q: 'karambti' }).items[0]?.weapon).toBe('Karambit');
    // Prefixo "ak 47 redline" fica no topo dos que têm "AK-47".
    expect(searchCatalog({ q: 'ak redline' }).items[0]?.id).toBe(AK_REDLINE);
  });

  it('não devolve lixo para uma busca sem relação', () => {
    expect(searchCatalog({ q: 'zzzzzzzzz qqqqqqq' }).total).toBe(0);
  });

  it('aguenta a busca em milhares de entradas em poucos milissegundos', () => {
    searchCatalog({ q: 'warmup' });
    const start = performance.now();
    for (const q of ['ak redlin', 'karambti', 'm4 hyper', 'gloves', 'sporty']) searchCatalog({ q });
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe('stickers e charms para aplicar', () => {
  it('busca stickers por nome e por categoria (o campeonato ou a coleção)', () => {
    const found = searchAttachments('sticker', { q: 'atirador dreamhack' });
    expect(found.items.map((s) => s.id)).toContain(FIRST_STICKER);
    expect(found.items[0]).toMatchObject({ type: 'sticker', image: expect.any(String) });
    const category = found.items.find((s) => s.id === FIRST_STICKER)?.category ?? undefined;
    expect(category).toBe('DreamHack Winter 2013');
    const byCategory = searchAttachments('sticker', { category, limit: 1000 });
    expect(byCategory.items.every((s) => s.category === category)).toBe(true);
    expect(byCategory.facets.categories.map((c) => c.value)).toContain(category);
  });

  it('a busca de stickers também é tolerante e ordena por relevância', () => {
    // Erro de digitação e palavra parcial; o nome em inglês e o PT-BR.
    expect(searchAttachments('sticker', { q: 'vitalty' }).items.length).toBeGreaterThan(0);
    const vitality = searchAttachments('sticker', { q: 'vitality' }).items;
    expect(vitality.length).toBeGreaterThan(0);
    expect(vitality[0]?.name.toLowerCase()).toContain('vitality');
    expect(searchAttachments('sticker', { q: 'dreamhak wintr 2013' }).items.length).toBeGreaterThan(
      0,
    );
    expect(searchAttachments('sticker', { q: 'zzzzzzzzz qqqqqqq' }).total).toBe(0);
  });

  it('nenhuma categoria é uma chave de tradução crua (#CSGO_...)', () => {
    for (const type of ['sticker', 'charm'] as const) {
      const { facets, items } = searchAttachments(type, { limit: 100000 });
      expect(facets.categories.filter((c) => c.value.startsWith('#'))).toEqual([]);
      expect(items.filter((i) => i.category?.startsWith('#'))).toEqual([]);
    }
  });

  it('busca charms separados dos stickers', () => {
    const charms = searchAttachments('charm', { q: '' });
    expect(charms.total).toBeGreaterThan(10);
    expect(charms.items.every((c) => c.type === 'charm')).toBe(true);
  });
});

describe('filtros da URL', () => {
  it('lê só valores conhecidos e ignora o resto', () => {
    expect(
      parseCatalogFilters({ q: ' ak ', tipo: 'weapon', raridade: 'covert', arma: 'AK-47' }),
    ).toEqual({ q: 'ak', type: 'weapon', rarity: 'covert', weapon: 'AK-47', limit: 48 });
    expect(parseCatalogFilters({ tipo: 'nave', raridade: ['x'], mostrar: '-3' })).toEqual({
      limit: 48,
    });
  });

  it('aumenta a página em múltiplos do tamanho, com teto', () => {
    expect(parseCatalogFilters({ mostrar: '96' }).limit).toBe(96);
    expect(parseCatalogFilters({ mostrar: '100000' }).limit).toBe(480);
  });
});

describe('especificação de edição do Item', () => {
  it('traz as faixas da skin e o que ela aceita', () => {
    expect(itemSpec(AK_REDLINE)).toMatchObject({
      wear: { min: 0.1, max: 0.7 },
      seed: { min: 1, max: 1000 },
      statTrak: true,
      nameTag: true,
      stickerSlots: 4,
      charm: { seed: { min: 1, max: 100000 } },
      viewer: '3d',
    });
  });

  it('music kits ficam sempre em 2D e sem atributos de arma', () => {
    const musicKit = catalogIndex().find((entry) => entry.type === 'musickit');
    expect(musicKit).toBeDefined();
    expect(itemSpec(musicKit?.id ?? -1)).toMatchObject({
      wear: null,
      seed: null,
      stickerSlots: 0,
      charm: null,
      viewer: '2d',
    });
  });

  it('não existe para Armas padrão', () => {
    expect(itemSpec(DEAGLE_DEFAULT)).toBeUndefined();
  });
});

describe('facetas em cache', () => {
  it('a busca reaproveita as facetas do mesmo recorte, qualquer que seja o texto digitado', () => {
    const first = searchCatalog({ type: 'weapon', weapon: 'AK-47' });
    const typed = searchCatalog({ type: 'weapon', weapon: 'AK-47', q: 'redline' });
    const rarer = searchCatalog({ type: 'weapon', weapon: 'AK-47', rarity: 'covert' });

    expect(typed.facets.weapons).toBe(first.facets.weapons);
    expect(typed.facets.collections).toBe(first.facets.collections);
    expect(rarer.facets.collections).toBe(first.facets.collections);
  });

  it('recortes diferentes têm facetas próprias', () => {
    const ak = searchCatalog({ type: 'weapon', weapon: 'AK-47' }).facets;
    const knives = searchCatalog({ type: 'knife' }).facets;

    expect(knives.weapons).not.toBe(ak.weapons);
    expect(searchCatalog({ type: 'weapon' }).facets.collections).not.toBe(ak.collections);
  });

  it('as categorias de sticker e de charm são montadas uma vez por tipo', () => {
    const sticker = searchAttachments('sticker', { q: 'cat' }).facets.categories;

    expect(searchAttachments('sticker', { limit: 1 }).facets.categories).toBe(sticker);
    expect(searchAttachments('charm', {}).facets.categories).not.toBe(sticker);
  });
});

/** Os caminhos e tipos de um valor JSON (`items[].image:string`); nulos não contam. */
function shapePaths(value: unknown, path = '', into = new Set<string>()): string[] {
  if (value === null || value === undefined) return [...into];
  if (Array.isArray(value)) {
    into.add(`${path}[]`);
    for (const element of value) shapePaths(element, `${path}[]`, into);
  } else if (typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      shapePaths(inner, path ? `${path}.${key}` : key, into);
    }
  } else {
    into.add(`${path}:${typeof value}`);
  }
  return [...into].sort();
}

describe('formato da resposta de /inventario/aplicaveis', () => {
  // A resposta fica em cache no navegador e na borda, e a versão vai na URL do pedido. Mudou o
  // formato (AttachmentPage)? Suba ATTACHMENTS_PAYLOAD_VERSION e atualize este registro: sem isso,
  // o cache antigo chegaria ao código novo no formato velho.
  const LOCKED = {
    version: '2',
    paths: [
      'facets.categories[]',
      'facets.categories[].keywords[]',
      'facets.categories[].keywords[]:string',
      'facets.categories[].label:string',
      'facets.categories[].value:string',
      'items[]',
      'items[].category:string',
      'items[].id:number',
      'items[].image:string',
      'items[].name:string',
      'items[].rarity:string',
      'items[].type:string',
      'total:number',
    ],
  };

  it('só muda junto com ATTACHMENTS_PAYLOAD_VERSION', () => {
    const paths = new Set<string>();
    for (const type of ['sticker', 'charm'] as const) {
      shapePaths(searchAttachments(type, { limit: 100000 }), '', paths);
    }

    expect({ version: ATTACHMENTS_PAYLOAD_VERSION, paths: [...paths].sort() }).toEqual(LOCKED);
  });
});

describe('busca rápida da paleta (Ctrl+K)', () => {
  it('devolve os mais relevantes primeiro, com a relevância, e respeita o limite', () => {
    const hits = quickSearchCatalog('linhas vermelhas', 3);

    expect(hits.length).toBeLessThanOrEqual(3);
    expect(hits[0]?.entry.id).toBe(AK_REDLINE);
    const scores = hits.map((hit) => hit.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores.every((score) => score > 0)).toBe(true);
  });

  it('acha em inglês e com erro de digitação, como o catálogo', () => {
    expect(quickSearchCatalog('redline', 5).map((hit) => hit.entry.id)).toContain(AK_REDLINE);
    expect(quickSearchCatalog('karambti', 5).map((hit) => hit.entry.type)).toContain('knife');
  });

  it('busca curta demais ou vazia não devolve nada', () => {
    expect(quickSearchCatalog('', 5)).toEqual([]);
    expect(quickSearchCatalog(' a ', 5)).toEqual([]);
  });

  it('nada casa: lista vazia', () => {
    expect(quickSearchCatalog('zzzzqqqq', 5)).toEqual([]);
  });
});

describe('busca rápida no Inventário da Conta', () => {
  const inventory = [
    { uid: 'u-awp', itemId: AWP_ASIIMOV },
    { uid: 'u-ak', itemId: AK_REDLINE },
    { uid: 'u-ak-2', itemId: AK_REDLINE },
    { uid: 'u-ghost', itemId: 99_999_999 },
  ];

  it('acha só o que a Conta tem, com o uid do Item para abrir o editor', () => {
    const hits = quickSearchOwned(inventory, 'asiimov', 5);

    expect(hits.map((hit) => [hit.uid, hit.entry.id])).toEqual([['u-awp', AWP_ASIIMOV]]);
  });

  it('cada cópia é um resultado (o Inventário pode ter várias da mesma skin)', () => {
    expect(quickSearchOwned(inventory, 'redline', 5).map((hit) => hit.uid)).toEqual([
      'u-ak',
      'u-ak-2',
    ]);
  });

  it('ignora Item que não está no catálogo e respeita o limite', () => {
    expect(quickSearchOwned(inventory, 'redline', 1)).toHaveLength(1);
    expect(quickSearchOwned(inventory, 'ghost', 5)).toEqual([]);
  });

  it('busca curta demais não devolve nada', () => {
    expect(quickSearchOwned(inventory, 'a', 5)).toEqual([]);
  });
});
