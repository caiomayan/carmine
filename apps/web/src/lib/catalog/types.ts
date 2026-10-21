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

/** Itens por página no catálogo e nas buscas de stickers e charms. */
export const CATALOG_PAGE_SIZE = 48;

/** Armas, facas e luvas têm skin: é o nome dela que distingue o cartão (a arma se repete). */
export const hasSkinName = (type: CatalogType | null) =>
  type === 'weapon' || type === 'knife' || type === 'glove';

/** Uma opção de filtro de lista longa: o valor da URL, o rótulo e outros nomes que a busca acha. */
export type FacetOption = { value: string; label: string; keywords: string[] };

/**
 * Versão do formato da resposta de `/inventario/aplicaveis`. Vai na URL do pedido porque a resposta
 * fica em cache no navegador e na borda (1 hora, e até 1 dia servindo a antiga enquanto revalida):
 * quem mudar o formato (`AttachmentPage`) sobe este número, e o cache antigo deixa de valer em vez de
 * chegar ao código novo no formato velho. O teste "formato da resposta de /inventario/aplicaveis"
 * (`catalog.test.ts`) falha se o formato mudar sem esta versão subir.
 */
export const ATTACHMENTS_PAYLOAD_VERSION = '2';
