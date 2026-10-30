/** O que as filas do painel (Denúncias, Fotos) fazem com os casos que já chegaram: buscar, ordenar e paginar. */

export type SortState<K extends string> = { key: K; dir: 1 | -1 };

/** Sem acento e sem caixa: "Antijogo" casa com "antijogo", "Sólon" com "solon". */
export const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Todas as palavras da busca aparecem no texto do caso (em qualquer ordem). */
export function matchesQuery(haystack: string, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = normalize(haystack);
  return words.every((word) => text.includes(word));
}

/**
 * Ordena por uma chave. O que não tem valor (`null`, como um caso sem prazo correndo) fica sempre no fim, nos dois
 * sentidos, e o desempate é a ordem em que a API mandou (estável).
 */
export function sortCases<T, K extends string>(
  items: readonly T[],
  value: (item: T, key: K) => string | number | null,
  sort: SortState<K>,
): T[] {
  return items
    .map((item, index) => ({ item, index, v: value(item, sort.key) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.index - b.index;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const order = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
      return order !== 0 ? order * sort.dir : a.index - b.index;
    })
    .map((entry) => entry.item);
}

export type Paged<T> = {
  slice: T[];
  page: number;
  pages: number;
  /** 1-based, e 0 quando não há nada. */
  from: number;
  to: number;
  total: number;
};

/** Uma página de `size` itens; a página pedida é encolhida se passou do fim (depois de um filtro). */
export function paginate<T>(items: readonly T[], page: number, size: number): Paged<T> {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  const slice = items.slice(current * size, current * size + size);
  return {
    slice,
    page: current,
    pages,
    from: items.length ? current * size + 1 : 0,
    to: current * size + slice.length,
    total: items.length,
  };
}
