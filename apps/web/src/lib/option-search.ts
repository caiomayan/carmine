/** Minúsculas, sem acentos, hífen como espaço e sem espaços nas pontas: base da busca nas listas. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Uma opção entra na busca quando todas as palavras digitadas aparecem no rótulo, em qualquer
 * ordem ("collection anubis" acha "The Anubis Collection"). Busca vazia aceita tudo.
 */
export function matchesSearch(label: string, query: string): boolean {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(label);
  return words.every((word) => haystack.includes(word));
}
