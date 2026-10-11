/**
 * Tipos do catálogo que o navegador também usa (sem a cs2-lib, que só roda no servidor).
 * Os nomes de tela ficam nas mensagens (`catalog.types`, `catalog.rarities`).
 */

/** Tipos de Item, na ordem das abas do catálogo. */
export const CATALOG_TYPES = ['weapon', 'knife', 'glove', 'agent', 'musickit'] as const;
export type CatalogType = (typeof CATALOG_TYPES)[number];

/** Só existem aplicados numa skin de arma; nunca são Itens. */
export const ATTACHMENT_TYPES = ['sticker', 'charm'] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

/** Raridades do CS2, da mais comum à mais rara. */
export const RARITIES = [
  'consumer',
  'industrial',
  'milspec',
  'restricted',
  'classified',
  'covert',
  'contraband',
] as const;
export type Rarity = (typeof RARITIES)[number];
