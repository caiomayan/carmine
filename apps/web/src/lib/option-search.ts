/**
 * Busca tolerante das listas (catálogo, seletor de stickers, Combobox). Sem biblioteca: palavras
 * parciais, erro de digitação (Damerau-Levenshtein com tolerância pelo tamanho da palavra) e
 * ordem por relevância (exato, prefixo, trecho, aproximado). Puro, roda no servidor e no navegador.
 */

/** Minúsculas, sem acentos, pontuação (hífen, "|", "★") como espaço e sem espaços nas pontas. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const tokens = (normalized: string) => normalized.split(' ').filter(Boolean);

// Linhas da tabela de distância, reaproveitadas entre as chamadas (a busca roda por tecla).
let rowA = new Int32Array(64);
let rowB = new Int32Array(64);
let rowC = new Int32Array(64);

/**
 * Distância de edição com transposição de letras vizinhas ("karambti" → "karambit" = 1): a
 * variante "optimal string alignment" do Damerau-Levenshtein. Compara `a` com as primeiras
 * `bLength` letras de `b` e desiste cedo: devolve `max + 1` se passar de `max`.
 */
function boundedDistance(a: string, b: string, bLength: number, max: number): number {
  const n = a.length;
  const m = Math.min(bLength, b.length);
  if (Math.abs(n - m) > max) return max + 1;
  if (m + 1 > rowA.length) {
    rowA = new Int32Array(m + 1);
    rowB = new Int32Array(m + 1);
    rowC = new Int32Array(m + 1);
  }
  let beforePrevious = rowA;
  let previous = rowB;
  let current = rowC;
  for (let j = 0; j <= m; j++) previous[j] = j;
  for (let i = 1; i <= n; i++) {
    current[0] = i;
    let rowMin = i;
    for (let j = 1; j <= m; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let best = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        best = Math.min(best, (beforePrevious[j - 2] as number) + 1);
      }
      current[j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > max) return max + 1;
    const free = beforePrevious;
    beforePrevious = previous;
    previous = current;
    current = free;
  }
  return previous[m] as number;
}

/** Distância de edição com transposição de letras vizinhas ("karambti" → "karambit" = 1). */
export function editDistance(a: string, b: string): number {
  return boundedDistance(a, b, b.length, Number.POSITIVE_INFINITY);
}

/** Erros aceitos por tamanho da palavra: até 3 letras é exato; 4 a 7, um erro; 8 ou mais, dois. */
const tolerance = (length: number) => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

/** Peso de cada nível de acerto de uma palavra (o texto secundário vale um pouco menos). */
const SCORE = { exact: 1, prefix: 0.7, middle: 0.55, fuzzy: 0.4, secondary: 0.9 };

/**
 * Pedaço no meio da palavra: de 3 letras em diante, ou de 2 se misturar letra e número ("a1" em
 * "m4a1"; os códigos das armas são assim). Duas letras soltas seriam só ruído ("ra" em "karambit").
 */
const canMatchInside = (query: string) =>
  query.length >= 3 || (query.length === 2 && /\p{L}/u.test(query) && /\p{N}/u.test(query));

/**
 * Uma palavra da busca contra uma palavra do texto: 0 se não casa. O erro de digitação só vale
 * para palavras soltas (`fuzzy`), não para as coladas ("ak47"), que só casam exato ou parcial.
 */
function wordScore(query: string, word: string, fuzzy: boolean): number {
  if (word === query) return SCORE.exact;
  if (word.startsWith(query)) return SCORE.prefix + 0.15 * (query.length / word.length);
  if (canMatchInside(query) && word.includes(query)) return SCORE.middle;
  if (!fuzzy) return 0;
  const allowed = tolerance(query.length);
  // Número tem que ser exato ("2026" não é "2025").
  if (allowed === 0 || /^\d+$/.test(query)) return 0;
  // Erro na palavra inteira ou só no começo dela (busca parcial com erro).
  const distance = Math.min(
    boundedDistance(query, word, word.length, allowed),
    word.length > query.length ? boundedDistance(query, word, query.length, allowed) : allowed + 1,
  );
  return distance <= allowed ? SCORE.fuzzy - 0.05 * distance : 0;
}

/** Texto já quebrado em palavras, para pontuar várias buscas sem refazer o trabalho. */
export type SearchDoc = {
  /** Palavras soltas do texto principal, depois as coladas ("ak" + "47" = "ak47"). */
  primary: string[];
  /** Quantas das palavras de `primary` são soltas (as primeiras). */
  primarySingles: number;
  /** O mesmo para o texto secundário. */
  secondary: string[];
  secondarySingles: number;
  /** Cada texto principal normalizado inteiro, para o desempate de "começa com a busca". */
  wholes: string[];
};

/** Palavras únicas e, depois, as vizinhas coladas: "ak 47" também vira "ak47". */
function wordsOf(normalizedTexts: string[]): { words: string[]; singles: number } {
  const singles = new Set<string>();
  const joined = new Set<string>();
  for (const text of normalizedTexts) {
    const words = tokens(text);
    for (const word of words) singles.add(word);
    for (let i = 1; i < words.length; i++) joined.add((words[i - 1] as string) + words[i]);
  }
  for (const word of singles) joined.delete(word);
  return { words: [...singles, ...joined], singles: singles.size };
}

/**
 * Indexa um texto. O principal é o nome (ou os nomes: PT-BR, o original em inglês, o tipo); o
 * secundário (coleção, categoria) casa, mas pontua um pouco menos.
 */
export function indexText(primary: string | string[], secondary = ''): SearchDoc {
  const names = (Array.isArray(primary) ? primary : [primary]).map(normalizeSearch);
  const main = wordsOf(names);
  const extra = wordsOf([normalizeSearch(secondary)]);
  return {
    primary: main.words,
    primarySingles: main.singles,
    secondary: extra.words,
    secondarySingles: extra.singles,
    wholes: names,
  };
}

function bestWordScore(doc: SearchDoc, word: string): number {
  let best = 0;
  for (let i = 0; i < doc.primary.length; i++) {
    const score = wordScore(word, doc.primary[i] as string, i < doc.primarySingles);
    if (score > best) best = score;
    if (best === SCORE.exact) return best;
  }
  for (let i = 0; i < doc.secondary.length; i++) {
    const score =
      wordScore(word, doc.secondary[i] as string, i < doc.secondarySingles) * SCORE.secondary;
    if (score > best) best = score;
  }
  return best;
}

/**
 * Relevância de um texto para a busca: 0 se não casa; quanto maior, melhor. Todas as palavras
 * da busca precisam casar, em qualquer ordem. Busca vazia casa com tudo.
 */
export function scoreDoc(doc: SearchDoc, query: string): number {
  const words = tokens(normalizeSearch(query));
  if (words.length === 0) return 1;
  let total = 0;
  for (const word of words) {
    const best = bestWordScore(doc, word);
    if (best === 0) return 0;
    total += best;
  }
  const joined = words.join(' ');
  const bonus = doc.wholes.includes(joined)
    ? 0.3
    : doc.wholes.some((whole) => whole.startsWith(joined))
      ? 0.15
      : 0;
  return total / words.length + bonus;
}

/**
 * Relevância de uma opção de lista: o rótulo e, se houver, outros nomes dela (o original em inglês,
 * o tipo). Todos valem como nome da opção.
 */
export function searchScore(text: string | string[], query: string): number {
  return scoreDoc(indexText(text), query);
}

/** O texto casa com a busca (palavras parciais, sem acento, com erro de digitação). */
export function matchesSearch(text: string | string[], query: string): boolean {
  return searchScore(text, query) > 0;
}
