import type { Rarity } from '../catalog/types';

/**
 * O que `GET /search/items` devolve à paleta de comandos (U3d): Itens do catálogo e do Inventário
 * da Conta da sessão, já com a relevância (a mesma escala do resto da paleta). Fica fora do
 * `catalog.ts` porque o navegador usa o tipo e a cs2-lib só roda no servidor.
 */
export type ItemHit = {
  /** Id do Item no catálogo (leva à página de adicionar). */
  id: number;
  /** Só nos do Inventário: leva ao editor do Item (`/inventory/<uid>`). */
  uid?: string;
  /** Skin em destaque (ou o nome do agente e do music kit); a arma é a linha de apoio. */
  title: string;
  subtitle: string | null;
  /** Armas, facas e luvas: a skin (o subtítulo) é o destaque e a arma, o apoio. */
  skinFirst: boolean;
  rarity: Rarity;
  image: string;
  score: number;
};

export type ItemSearch = { inventory: ItemHit[]; catalog: ItemHit[] };

/** Quantos de cada lado o servidor manda (o grupo da paleta corta de novo, no limite dele). */
export const ITEM_SEARCH_LIMIT = 6;
