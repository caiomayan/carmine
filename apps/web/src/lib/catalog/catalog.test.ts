import { describe, expect, it } from 'vitest';
import {
  CATALOG_PAGE_SIZE,
  catalogEntry,
  catalogIndex,
  itemSpec,
  parseCatalogFilters,
  searchAttachments,
  searchCatalog,
} from './catalog';

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
    expect(ids(searchCatalog({ q: 'vermelhas ak' }))).toEqual([AK_REDLINE]);
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
    expect(facets.weapons).toContain('AK-47');
    expect(facets.weapons).not.toContain('Karambit');
    expect(facets.collections.length).toBeGreaterThan(10);
    expect(searchCatalog({ type: 'knife' }).facets.weapons).toContain('Karambit');
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
    expect(byCategory.facets.categories).toContain(category);
  });

  it('nenhuma categoria é uma chave de tradução crua (#CSGO_...)', () => {
    for (const type of ['sticker', 'charm'] as const) {
      const { facets, items } = searchAttachments(type, { limit: 100000 });
      expect(facets.categories.filter((c) => c.startsWith('#'))).toEqual([]);
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
