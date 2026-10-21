import { CS2_ITEMS, CS2Economy, type CS2EconomyItem } from '@ianlucas/cs2-lib';
import { brazilian } from '@ianlucas/cs2-lib/translations/brazilian';
import {
  type AttachmentType,
  CATALOG_PAGE_SIZE,
  CATALOG_TYPES,
  type CatalogType,
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

/** Minúsculas e sem acentos, para a busca não depender de como a pessoa digita. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function matchesQuery(haystack: string, query: string | undefined): boolean {
  if (!query) return true;
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
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
  facets: { weapons: string[]; collections: string[]; rarities: Rarity[] };
};

const haystacks = new WeakMap<CatalogEntry | AttachmentEntry, string>();
function haystackOf(entry: CatalogEntry | AttachmentEntry): string {
  let haystack = haystacks.get(entry);
  if (haystack === undefined) {
    const extra = 'collection' in entry ? entry.collection : entry.category;
    haystack = normalize(`${entry.name} ${extra ?? ''}`);
    haystacks.set(entry, haystack);
  }
  return haystack;
}

const distinct = (values: (string | null)[]) =>
  [...new Set(values.filter((value): value is string => !!value))].sort(collator.compare);

const pageLimit = (limit: number | undefined) =>
  Math.min(Math.max(limit ?? CATALOG_PAGE_SIZE, 1), CATALOG_PAGE_SIZE * MAX_PAGES);

export function searchCatalog(filters: CatalogFilters): CatalogPage {
  const all = catalogIndex();
  const ofType = filters.type ? all.filter((entry) => entry.type === filters.type) : all;
  const ofWeapon = filters.weapon ? ofType.filter((e) => e.weapon === filters.weapon) : ofType;
  const matches = ofWeapon.filter(
    (entry) =>
      (!filters.rarity || entry.rarity === filters.rarity) &&
      (!filters.collection || entry.collection === filters.collection) &&
      matchesQuery(haystackOf(entry), filters.q),
  );
  const rarities = new Set(ofWeapon.map((entry) => entry.rarity));
  return {
    items: matches.slice(0, pageLimit(filters.limit)),
    total: matches.length,
    facets: {
      weapons: distinct(ofType.map((entry) => entry.weapon)),
      collections: distinct(ofWeapon.map((entry) => entry.collection)),
      rarities: RARITIES.filter((rarity) => rarities.has(rarity)),
    },
  };
}

const attachments: Partial<Record<AttachmentType, AttachmentEntry[]>> = {};

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
  facets: { categories: string[] };
};

export function searchAttachments(
  type: AttachmentType,
  filters: AttachmentFilters,
): AttachmentPage {
  const all = attachmentIndex(type);
  const matches = all.filter(
    (entry) =>
      (!filters.category || entry.category === filters.category) &&
      (!filters.rarity || entry.rarity === filters.rarity) &&
      matchesQuery(haystackOf(entry), filters.q),
  );
  return {
    items: matches.slice(0, pageLimit(filters.limit)),
    total: matches.length,
    facets: { categories: distinct(all.map((entry) => entry.category)) },
  };
}

export function attachmentEntry(id: number): AttachmentEntry | undefined {
  const item = economy().items.get(id);
  if (!item) return undefined;
  const type = item.isSticker() ? 'sticker' : item.isKeychain() ? 'charm' : null;
  return type ? attachmentIndex(type).find((entry) => entry.id === id) : undefined;
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
