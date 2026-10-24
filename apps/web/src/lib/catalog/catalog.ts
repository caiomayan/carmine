import { SEARCH_MIN_LENGTH } from '@carmine/contracts/rules';
import { CS2_ITEMS, CS2Economy, type CS2EconomyItem } from '@ianlucas/cs2-lib';
import { brazilian } from '@ianlucas/cs2-lib/translations/brazilian';
import { english } from '@ianlucas/cs2-lib/translations/english';
import { indexText, type SearchDoc, scoreDoc } from '../option-search';
import { skinPalette } from '../skin-palette';
import {
  type AttachmentType,
  CATALOG_PAGE_SIZE,
  CATALOG_TYPES,
  type CatalogType,
  type FacetOption,
  RARITIES,
  type Rarity,
} from './types';

/**
 * Catálogo de Itens a partir da `@ianlucas/cs2-lib` (ADR 0006), com os nomes em PT-BR da
 * própria lib. **Só no servidor**: os dados da lib passam de 13 MB e nunca vão para o navegador;
 * as páginas recebem só o que mostram (entradas compactas e a especificação de um Item).
 *
 * Itens: skins de arma, facas, luvas, agentes e music kits, sem Armas padrão nem luvas base
 * (CONTEXT.md). Stickers e charms não são Itens: aparecem só para aplicar numa skin de arma.
 */

export { CATALOG_PAGE_SIZE };

const MAX_PAGES = 10;

/** Uma entrada do catálogo, só com o que a grade e os filtros usam. */
export type CatalogEntry = {
  id: number;
  type: CatalogType;
  /** Nome completo em PT-BR, como no jogo. */
  name: string;
  /** Arma, faca ou luvas de base (ex.: "AK-47"); nulo para agentes e music kits. */
  weapon: string | null;
  /** Nome da skin (ex.: "Linhas Vermelhas"); nulo na faca sem pintura. */
  skin: string | null;
  /** Linha principal e de apoio para mostrar o Item. */
  title: string;
  subtitle: string | null;
  rarity: Rarity;
  collection: string | null;
  image: string;
  /** Agentes e music kits exigem Período VIP. */
  vip: boolean;
};

/** Sticker ou charm, para aplicar numa skin de arma. */
export type AttachmentEntry = {
  id: number;
  type: AttachmentType;
  name: string;
  /** Campeonato ou coleção do sticker; nulo nos charms. */
  category: string | null;
  rarity: Rarity;
  image: string;
};

const RARITY_BY_COLOR: Record<string, Rarity> = {
  '#ded6cc': 'consumer',
  '#b0c3d9': 'consumer',
  '#5e98d9': 'industrial',
  '#4b69ff': 'milspec',
  '#8847ff': 'restricted',
  '#d32ce6': 'classified',
  '#eb4b4b': 'covert',
  '#e4ae39': 'contraband',
};

const TYPE_OF_LIB: Partial<Record<string, CatalogType>> = {
  weapon: 'weapon',
  melee: 'knife',
  glove: 'glove',
  agent: 'agent',
  musickit: 'musickit',
};

let loaded = false;
/** A economia da cs2-lib carregada com os nomes em PT-BR (só no servidor). */
export function economy() {
  if (!loaded) {
    CS2Economy.load({ items: CS2_ITEMS, language: brazilian });
    loaded = true;
  }
  return CS2Economy;
}

/** O nome da lib tem espaços duplos em alguns agentes ("Rebelde de Campo  | ..."). */
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

function catalogTypeOf(item: CS2EconomyItem): CatalogType | null {
  const type = TYPE_OF_LIB[item.type];
  if (!type || item.isDefault) return null;
  // As luvas base não são Itens; a faca sem pintura é (existe no jogo).
  if (type === 'glove' && item.isBase) return null;
  // Armas sem skin são sempre Armas padrão.
  if (type === 'weapon' && item.isBase) return null;
  return type;
}

function toEntry(item: CS2EconomyItem, type: CatalogType): CatalogEntry {
  const name = clean(item.name);
  const parts = name.split(' | ').map(clean);
  const hasBase = type === 'weapon' || type === 'knife' || type === 'glove';
  const weapon = hasBase ? clean(item.parent?.name ?? parts[0] ?? name) : null;
  const skin = hasBase ? (parts.length > 1 ? parts.slice(1).join(' | ') : null) : null;
  // Agentes: "Agente | Nome | Facção"; music kits: "Trilha Sonora | Artista, Nome".
  const title = hasBase ? (weapon ?? name) : (parts[1] ?? name);
  const subtitle = hasBase ? skin : (parts[2] ?? null);
  return {
    id: item.id,
    type,
    name,
    weapon,
    skin,
    title,
    subtitle,
    rarity: RARITY_BY_COLOR[item.rarityColor] ?? 'consumer',
    collection: item.collectionName ? clean(item.collectionName) : null,
    image: item.getImageUrl(),
    vip: type === 'agent' || type === 'musickit',
  };
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const TYPE_ORDER = new Map(CATALOG_TYPES.map((type, index) => [type, index]));

let index: CatalogEntry[] | null = null;
let byId: Map<number, CatalogEntry> | null = null;

export function catalogIndex(): readonly CatalogEntry[] {
  if (!index) {
    index = [];
    for (const item of economy().itemsAsArray) {
      const type = catalogTypeOf(item);
      if (type) index.push(toEntry(item, type));
    }
    index.sort(
      (a, b) =>
        (TYPE_ORDER.get(a.type) ?? 0) - (TYPE_ORDER.get(b.type) ?? 0) ||
        collator.compare(a.title, b.title) ||
        collator.compare(a.subtitle ?? '', b.subtitle ?? '') ||
        a.id - b.id,
    );
    byId = new Map(index.map((entry) => [entry.id, entry]));
  }
  return index;
}

export function catalogEntry(id: number): CatalogEntry | undefined {
  catalogIndex();
  return byId?.get(id);
}

export type CatalogFilters = {
  q?: string;
  type?: CatalogType;
  weapon?: string;
  rarity?: Rarity;
  collection?: string;
  limit?: number;
};

export type CatalogPage = {
  items: CatalogEntry[];
  total: number;
  facets: { weapons: FacetOption[]; collections: FacetOption[]; rarities: Rarity[] };
};

/** O que a busca acha além do nome: o tipo nos dois idiomas ("knife" acha as facas). */
const TYPE_WORDS: Record<CatalogType, string> = {
  weapon: 'arma weapon',
  knife: 'faca knife',
  glove: 'luvas gloves',
  agent: 'agente agent',
  musickit: 'music kit trilha sonora',
};

/**
 * Texto de busca de uma entrada: o nome em PT-BR, o original em inglês da lib e o tipo
 * (principais), mais a coleção ou categoria nos dois idiomas (secundários). O tipo é principal
 * para "gloves" achar as luvas antes das armas da "Coleção Luvas". Montado uma vez por entrada.
 */
const docs = new WeakMap<CatalogEntry | AttachmentEntry, SearchDoc>();
function docOf(entry: CatalogEntry | AttachmentEntry): SearchDoc {
  let doc = docs.get(entry);
  if (!doc) {
    const original = english[entry.id];
    const extra = 'collection' in entry ? entry.collection : entry.category;
    const originalExtra = original?.collectionName ?? original?.categoryName;
    const type = 'collection' in entry ? TYPE_WORDS[entry.type] : '';
    doc = indexText(
      [entry.name, original?.name, type].filter((text): text is string => !!text),
      [extra, originalExtra].filter(Boolean).join(' '),
    );
    docs.set(entry, doc);
  }
  return doc;
}

/**
 * As entradas que casam com a busca, da mais relevante para a menos (exato, prefixo, trecho,
 * aproximado); sem busca, na ordem em que vieram. A ordem original desempata.
 */
function rank<T extends CatalogEntry | AttachmentEntry>(
  entries: T[],
  query: string | undefined,
): T[] {
  if (!query?.trim()) return entries;
  const scored: { entry: T; score: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const score = scoreDoc(docOf(entry), query);
    if (score > 0) scored.push({ entry, score, order });
  });
  return scored.sort((a, b) => b.score - a.score || a.order - b.order).map(({ entry }) => entry);
}

const QUICK_MAX_LENGTH = 80;

/** Os `limit` de maior relevância (os de zero não casam); no empate, a ordem em que vieram. */
function topScored<T extends { score: number }>(hits: T[], limit: number): T[] {
  return hits
    .map((hit, order) => ({ hit, order }))
    .filter(({ hit }) => hit.score > 0)
    .sort((a, b) => b.hit.score - a.hit.score || a.order - b.order)
    .slice(0, limit)
    .map(({ hit }) => hit);
}

/** Um Item do catálogo achado pela paleta de comandos, com a relevância na escala da busca. */
export type QuickHit = { entry: CatalogEntry; score: number };

function quickQuery(query: string): string | null {
  const text = query.trim().slice(0, QUICK_MAX_LENGTH);
  return text.length >= SEARCH_MIN_LENGTH ? text : null;
}

/**
 * Os Itens que mais combinam com a busca da paleta (Ctrl+K), com a relevância de cada um para o
 * navegador poder ordená-los junto de páginas e jogadores. Mesma busca tolerante e bilíngue do
 * catálogo, sem montar as facetas (a paleta não usa). Busca curta demais não devolve nada.
 */
export function quickSearchCatalog(query: string, limit: number): QuickHit[] {
  const text = quickQuery(query);
  if (!text) return [];
  return topScored(
    catalogIndex().map((entry) => ({ entry, score: scoreDoc(docOf(entry), text) })),
    limit,
  );
}

/** Um Item do Inventário da Conta achado pela paleta; `uid` abre o editor dele. */
export type OwnedHit = QuickHit & { uid: string };

/**
 * Os Itens do Inventário da Conta que combinam com a busca da paleta. Cada cópia é um resultado
 * (o Inventário aceita várias da mesma skin). Item que o catálogo não conhece é ignorado.
 */
export function quickSearchOwned(
  items: readonly { uid: string; itemId: number }[],
  query: string,
  limit: number,
): OwnedHit[] {
  const text = quickQuery(query);
  if (!text) return [];
  const scored = items.flatMap(({ uid, itemId }) => {
    const entry = catalogEntry(itemId);
    return entry ? [{ entry, uid, score: scoreDoc(docOf(entry), text) }] : [];
  });
  return topScored(scored, limit);
}

/**
 * Opções de um filtro de lista (Arma, Coleção, categoria): os valores distintos, em ordem
 * alfabética, cada um com os outros nomes dele (o original em inglês, o tipo) para o Combobox
 * achar "knife" na Arma e "kilowatt" na Coleção, que em PT-BR é "Quilowatt".
 */
function facetOptions<T extends CatalogEntry | AttachmentEntry>(
  entries: readonly T[],
  pick: (entry: T) => string | null,
  aliasesOf: (entry: T) => (string | undefined)[],
): FacetOption[] {
  const options = new Map<string, FacetOption>();
  for (const entry of entries) {
    const value = pick(entry);
    if (!value) continue;
    const option = options.get(value) ?? { value, label: value, keywords: [] };
    options.set(value, option);
    for (const alias of aliasesOf(entry)) {
      if (alias && !alias.startsWith('#') && !option.keywords.includes(alias)) {
        option.keywords.push(alias);
      }
    }
  }
  return [...options.values()].sort((a, b) => collator.compare(a.value, b.value));
}

/**
 * Facetas por recorte: dependem só do tipo e da arma (ou do tipo do anexo), não do texto
 * digitado nem da raridade, e a busca roda a cada tecla. São montadas uma vez e nunca alteradas.
 */
const facetCache = new Map<string, FacetOption[]>();

function cachedFacet(key: string, build: () => FacetOption[]): FacetOption[] {
  let options = facetCache.get(key);
  if (!options) {
    options = build();
    facetCache.set(key, options);
  }
  return options;
}

/** O nome da arma em inglês ("Dual Berettas"): o que vem antes da skin no nome original. */
const englishWeapon = (entry: CatalogEntry) => english[entry.id]?.name.split(' | ')[0];

const pageLimit = (limit: number | undefined) =>
  Math.min(Math.max(limit ?? CATALOG_PAGE_SIZE, 1), CATALOG_PAGE_SIZE * MAX_PAGES);

export function searchCatalog(filters: CatalogFilters): CatalogPage {
  const all = catalogIndex();
  const ofType = filters.type ? all.filter((entry) => entry.type === filters.type) : all;
  const ofWeapon = filters.weapon ? ofType.filter((e) => e.weapon === filters.weapon) : ofType;
  const matches = rank(
    ofWeapon.filter(
      (entry) =>
        (!filters.rarity || entry.rarity === filters.rarity) &&
        (!filters.collection || entry.collection === filters.collection),
    ),
    filters.q,
  );
  const rarities = new Set(ofWeapon.map((entry) => entry.rarity));
  return {
    items: matches.slice(0, pageLimit(filters.limit)),
    total: matches.length,
    facets: {
      weapons: cachedFacet(`weapons|${filters.type ?? ''}`, () =>
        facetOptions(
          ofType,
          (entry) => entry.weapon,
          (entry) => [englishWeapon(entry), TYPE_WORDS[entry.type]],
        ),
      ),
      collections: cachedFacet(`collections|${filters.type ?? ''}|${filters.weapon ?? ''}`, () =>
        facetOptions(
          ofWeapon,
          (entry) => entry.collection,
          (entry) => [english[entry.id]?.collectionName],
        ),
      ),
      rarities: RARITIES.filter((rarity) => rarities.has(rarity)),
    },
  };
}

const attachments: Partial<Record<AttachmentType, AttachmentEntry[]>> = {};
const attachmentsById = new Map<number, AttachmentEntry>();

function attachmentIndex(type: AttachmentType): AttachmentEntry[] {
  let list = attachments[type];
  if (!list) {
    list = economy()
      .itemsAsArray.filter((item) => (type === 'sticker' ? item.isSticker() : item.isKeychain()))
      .map((item) => ({
        id: item.id,
        type,
        name: clean(item.name),
        // Chave de tradução que a lib não resolveu ("#CSGO_..."): sem categoria, em vez de crua.
        category:
          item.categoryName && !item.categoryName.startsWith('#') ? clean(item.categoryName) : null,
        rarity: RARITY_BY_COLOR[item.rarityColor] ?? 'consumer',
        image: item.getImageUrl(),
      }))
      // Os mais novos primeiro: são os que a pessoa mais procura.
      .sort((a, b) => b.id - a.id);
    attachments[type] = list;
    for (const entry of list) attachmentsById.set(entry.id, entry);
  }
  return list;
}

export type AttachmentFilters = {
  q?: string;
  category?: string;
  rarity?: Rarity;
  limit?: number;
};

export type AttachmentPage = {
  items: AttachmentEntry[];
  total: number;
  facets: { categories: FacetOption[] };
};

export function searchAttachments(
  type: AttachmentType,
  filters: AttachmentFilters,
): AttachmentPage {
  const all = attachmentIndex(type);
  const matches = rank(
    all.filter(
      (entry) =>
        (!filters.category || entry.category === filters.category) &&
        (!filters.rarity || entry.rarity === filters.rarity),
    ),
    filters.q,
  );
  return {
    items: matches.slice(0, pageLimit(filters.limit)),
    total: matches.length,
    facets: {
      categories: cachedFacet(`categories|${type}`, () =>
        facetOptions(
          all,
          (entry) => entry.category,
          (entry) => [english[entry.id]?.categoryName],
        ),
      ),
    },
  };
}

export function attachmentEntry(id: number): AttachmentEntry | undefined {
  const item = economy().items.get(id);
  if (!item) return undefined;
  const type = item.isSticker() ? 'sticker' : item.isKeychain() ? 'charm' : null;
  if (!type) return undefined;
  // Montar o índice do tipo é o que popula `attachmentsById` (uma vez só).
  attachmentIndex(type);
  return attachmentsById.get(id);
}

type SearchParamValue = string | string[] | undefined;
const one = (value: SearchParamValue) => (Array.isArray(value) ? undefined : value?.trim());

/** Os filtros do catálogo na URL (`?q=&tipo=&arma=&raridade=&colecao=&mostrar=`). */
export function parseCatalogFilters(params: Record<string, SearchParamValue>): CatalogFilters {
  const filters: CatalogFilters = {};
  const q = one(params.q);
  if (q) filters.q = q.slice(0, 80);
  const type = one(params.tipo);
  if (type && (CATALOG_TYPES as readonly string[]).includes(type)) {
    filters.type = type as CatalogType;
  }
  const weapon = one(params.arma);
  if (weapon) filters.weapon = weapon;
  const rarity = one(params.raridade);
  if (rarity && (RARITIES as readonly string[]).includes(rarity)) {
    filters.rarity = rarity as Rarity;
  }
  const collection = one(params.colecao);
  if (collection) filters.collection = collection;
  const shown = Number(one(params.mostrar));
  filters.limit =
    Number.isInteger(shown) && shown > 0
      ? Math.min(Math.ceil(shown / CATALOG_PAGE_SIZE), MAX_PAGES) * CATALOG_PAGE_SIZE
      : CATALOG_PAGE_SIZE;
  return filters;
}

type Range = { min: number; max: number };
type OptionalRange = { min: number | undefined; max: number | undefined };

/** O que o editor precisa saber de um Item do catálogo: faixas e atributos aceitos. */
export type ItemSpec = {
  entry: CatalogEntry;
  /** Cores vivas da imagem da skin (cor ambiente do editor); nulo sem paleta. */
  palette: readonly string[] | null;
  /** Faixa do float da skin; nulo se o Item não tem float (faca sem pintura, agente...). */
  wear: Range | null;
  seed: Range | null;
  statTrak: boolean;
  nameTag: boolean;
  /** Slots de sticker no modelo da arma; 0 se não aceita stickers. */
  stickerSlots: number;
  stickerOffset: { x: OptionalRange; y: OptionalRange } | null;
  charm: { seed: Range; position: { x: OptionalRange; y: OptionalRange; z: OptionalRange } } | null;
  /** Como o Item aparece: 3D no viewer ou sempre 2D (music kits e agentes). */
  viewer: '3d' | '2d';
};

export function itemSpec(id: number): ItemSpec | undefined {
  const entry = catalogEntry(id);
  if (!entry) return undefined;
  const item = economy().getById(id);
  const painted = !item.isBase;
  const stickers = item.hasStickers();
  const keychains = item.hasKeychains();
  return {
    entry,
    palette: skinPalette(id),
    wear:
      painted && item.hasWear() ? { min: item.getMinimumWear(), max: item.getMaximumWear() } : null,
    seed:
      painted && item.hasSeed() ? { min: item.getMinimumSeed(), max: item.getMaximumSeed() } : null,
    statTrak: item.hasStatTrak(),
    nameTag: item.hasNameTag(),
    stickerSlots: stickers ? item.getStickerSchemaCount() : 0,
    stickerOffset: stickers ? item.getStickerOffsetBounds() : null,
    charm: keychains
      ? { seed: { min: 1, max: 100_000 }, position: item.getKeychainPositionBounds() }
      : null,
    viewer: entry.type === 'agent' || entry.type === 'musickit' ? '2d' : '3d',
  };
}
