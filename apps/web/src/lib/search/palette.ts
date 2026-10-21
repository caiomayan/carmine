import { indexText, scoreDoc, searchScore } from '../option-search';

/**
 * Lógica pura da paleta de comandos (Ctrl+K, U3d): a relevância de cada tipo de resultado e a
 * ordem dos grupos. Tudo na mesma escala do `option-search` (a do catálogo e do Combobox), para
 * um acerto de página e um de skin poderem ser comparados.
 */

/** Os tipos de resultado, na ordem fixa que desempata os grupos. */
export const GROUPS = ['pages', 'actions', 'inventory', 'catalog', 'players', 'servers'] as const;
export type PaletteGroup = (typeof GROUPS)[number];

/**
 * Quantos resultados cada grupo mostra: a paleta é um atalho, não uma página de busca. As páginas
 * cabem todas (são 7 no máximo, com Meu perfil e o Painel da Staff), para a lista sem busca servir
 * de menu.
 */
export const GROUP_LIMIT: Record<PaletteGroup, number> = {
  pages: 8,
  actions: 4,
  inventory: 4,
  catalog: 6,
  players: 8,
  servers: 4,
};

export type Scored<T> = { item: T; score: number };
export type Hit<T> = Scored<T> & { group: PaletteGroup };

/** Algo com rótulo e palavras-chave (em português e inglês) para a busca achar. */
export type Searchable = { label: string; keywords?: readonly string[] };

/**
 * Páginas e ações que casam com a busca, da mais para a menos relevante. O rótulo é o nome do
 * item e as palavras-chave valem como outros nomes dele. Sem busca, tudo, na ordem recebida.
 */
export function rankStatic<T extends Searchable>(items: readonly T[], query: string): Scored<T>[] {
  const scored: Scored<T>[] = [];
  for (const item of items) {
    // As palavras-chave são o texto secundário: casam, mas valem um pouco menos que o rótulo.
    const score = scoreDoc(indexText(item.label, (item.keywords ?? []).join(' ')), query);
    if (score > 0) scored.push({ item, score });
  }
  // `sort` é estável: no empate, a ordem em que as páginas foram declaradas.
  return scored.sort((a, b) => b.score - a.score);
}

/** Relevância de um servidor: o identificador, o nome de vitrine, o código e o mapa. */
export function scoreServer(
  server: {
    name: string;
    showcaseName: string | null;
    map: string | null;
    code: string | null;
  },
  query: string,
): number {
  const names = [server.name, server.showcaseName, server.code, server.map].filter(
    (text): text is string => !!text,
  );
  return searchScore(names, query);
}

/**
 * Junta os acertos de todas as fontes em grupos: cada grupo com os seus melhores (até o limite),
 * e os grupos do que tem o melhor acerto para o menor. No empate de grupos vale a ordem fixa de
 * `GROUPS`; no empate de acertos, a ordem em que vieram.
 */
export function groupResults<T>(
  hits: readonly Hit<T>[],
): { group: PaletteGroup; hits: Hit<T>[] }[] {
  const groups: { group: PaletteGroup; hits: Hit<T>[] }[] = [];
  for (const group of GROUPS) {
    const own = hits
      .filter((hit) => hit.group === group)
      .sort((a, b) => b.score - a.score)
      .slice(0, GROUP_LIMIT[group]);
    if (own.length > 0) groups.push({ group, hits: own });
  }
  // Também estável: a ordem fixa de `GROUPS` já está no vetor.
  return groups.sort((a, b) => (b.hits[0]?.score ?? 0) - (a.hits[0]?.score ?? 0));
}
