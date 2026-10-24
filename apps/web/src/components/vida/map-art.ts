import catalog from './map-art.json';

/**
 * Arte dos mapas (telas de carregamento do CS2, otimizadas por `scripts/maps-art.mjs` em AVIF e WebP de 480,
 * 960 e 1600 px, com as cores vivas já extraídas e gravadas em `map-art.json`). **Parte pura, sem React**: serve
 * aos componentes de servidor (rodapé, Ranking, Home), que escolhem a variante e passam ao navegador só o
 * {@link ArtChoice} (id, 3 cores e a cor média), de modo que o JSON inteiro (~7,5 kB gz) não entra no JS das páginas.
 *  - Cada mapa tem várias variantes; a escolhida é estável por dia (não muda a cada render).
 *  - No tema escuro, as variantes `_night` são preferidas quando existem.
 */
export type ArtVariant = {
  id: string;
  night: boolean;
  blur: string;
  colors: string[];
  average: string;
  light: number;
};

/** O que o navegador precisa para desenhar a arte: sem o `blur` (a cor média faz de fundo enquanto carrega). */
export type ArtChoice = { id: string; night: boolean; colors: string[]; average: string };

/** A escolha para cada tema, para o navegador trocar sem pedir nada ao servidor quando o tema muda. */
export type ArtPair = { day: ArtChoice; night: ArtChoice };

const CATALOG = catalog as unknown as Record<string, ArtVariant[]>;
const WIDTHS = [480, 960, 1600] as const;

/** O dia de hoje (UTC), a chave da variação diária. */
export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function hasMapArt(map: string): boolean {
  return (CATALOG[map]?.length ?? 0) > 0;
}

/** A variante do dia para o mapa; `night` prefere as noturnas (tema escuro). */
export function pickVariant(map: string, night: boolean, day = dayKey()): ArtVariant | null {
  const all = CATALOG[map];
  if (!all?.length) return null;
  const nights = all.filter((v) => v.night);
  const days = all.filter((v) => !v.night);
  const pool = night && nights.length ? nights : days.length ? days : all;
  return pool[hash(`${map}:${day}`) % pool.length] ?? null;
}

/** A escolha do dia, só com o que o navegador usa. */
export function artChoice(map: string, night: boolean, day = dayKey()): ArtChoice | null {
  const variant = pickVariant(map, night, day);
  if (!variant) return null;
  return {
    id: variant.id,
    night: variant.night,
    colors: variant.colors,
    average: variant.average,
  };
}

/** As duas escolhas (tema claro e escuro) de um mapa; nulo sem arte. */
export function artPair(map: string, day = dayKey()): ArtPair | null {
  const dayChoice = artChoice(map, false, day);
  const nightChoice = artChoice(map, true, day);
  return dayChoice && nightChoice ? { day: dayChoice, night: nightChoice } : null;
}

/** O par de cada mapa que tem arte (a Home passa a tabela inteira: o mapa de um servidor muda com a rotação). */
export function artTable(day = dayKey()): Record<string, ArtPair> {
  const table: Record<string, ArtPair> = {};
  for (const map of Object.keys(CATALOG)) {
    const pair = artPair(map, day);
    if (pair) table[map] = pair;
  }
  return table;
}

export const artUrl = (
  map: string,
  id: string,
  width: (typeof WIDTHS)[number] = 1600,
  ext: 'webp' | 'avif' = 'webp',
) => `/maps/${map}/${id}-${width}.${ext}`;

/** `srcset` de uma variante, nos três tamanhos. */
export const artSrcSet = (map: string, id: string, ext: 'webp' | 'avif') =>
  WIDTHS.map((w) => `${artUrl(map, id, w, ext)} ${w}w`).join(', ');

/** As cores vivas extraídas do mapa (3), da variante do dia (a mesma que a imagem mostra). */
export function mapPalette(map: string, night: boolean): [string, string, string] {
  const colors = pickVariant(map, night)?.colors ?? ['#888888'];
  return [
    colors[0] ?? '#888',
    colors[1] ?? colors[0] ?? '#888',
    colors[2] ?? colors[1] ?? colors[0] ?? '#888',
  ];
}

/** As 3 cores de uma escolha (a mesma regra de {@link mapPalette}, para quem já a recebeu do servidor). */
export function choicePalette(choice: Pick<ArtChoice, 'colors'> | null): [string, string, string] {
  const colors = choice?.colors ?? ['#888888'];
  return [
    colors[0] ?? '#888',
    colors[1] ?? colors[0] ?? '#888',
    colors[2] ?? colors[1] ?? colors[0] ?? '#888',
  ];
}
