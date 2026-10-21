/**
 * Imagem de cada mapa da rotação (U2), sem React. Os arquivos ficam em `public/maps/` e saem de
 * `scripts/maps.mjs`; a lista abaixo e a do script precisam andar juntas (README do web).
 */

/** Os mapas da rotação dos perfis (`infra/cs2/profiles/*`) que têm imagem, pelo nome sem o prefixo. */
export const ROTATION_MAPS = [
  'ancient',
  'anubis',
  'cache',
  'dust2',
  'inferno',
  'mirage',
  'nuke',
  'overpass',
] as const;

/** Larguras geradas por mapa: a menor serve o celular, a maior o desktop. */
export const MAP_ART_WIDTHS = [800, 1600] as const;

/** Proporção das miniaturas originais (16:9): o `width`/`height` da imagem evitam o salto de layout. */
const HEIGHT_RATIO = 9 / 16;

export type MapArt = {
  slug: (typeof ROTATION_MAPS)[number];
  avif: string;
  webp: string;
  /** Imagem de reserva para quem não entende `srcset`: a maior em WebP. */
  src: string;
  /** Tamanho da maior imagem, para o navegador reservar o espaço. */
  width: number;
  height: number;
};

/** O nome do mapa sem caminho da Workshop, em minúsculas e sem espaços nas pontas. */
function baseName(map: string): string {
  return (map.trim().toLowerCase().split('/').pop() ?? '').trim();
}

const srcset = (slug: string, format: 'avif' | 'webp') =>
  MAP_ART_WIDTHS.map((w) => `/maps/${slug}-${w}.${format} ${w}w`).join(', ');

/** A imagem do mapa atual do servidor, ou nulo quando não há (o cartão cai num fundo neutro). */
export function mapArt(map: string | null): MapArt | null {
  if (!map) return null;
  const slug = baseName(map).replace(/^de_/, '');
  const known = ROTATION_MAPS.find((m) => m === slug);
  if (!known || !baseName(map).startsWith('de_')) return null;
  const width = MAP_ART_WIDTHS[MAP_ART_WIDTHS.length - 1] ?? 1600;
  return {
    slug: known,
    avif: srcset(known, 'avif'),
    webp: srcset(known, 'webp'),
    src: `/maps/${known}-${width}.webp`,
    width,
    height: Math.round(width * HEIGHT_RATIO),
  };
}

/** "de_mirage" vira "Mirage". Sem mapa, nulo: quem chama escolhe o texto de reserva. */
export function mapDisplayName(map: string | null): string | null {
  if (!map) return null;
  const name = baseName(map).replace(/^[a-z]{2}_/, '');
  return name ? name.charAt(0).toLocaleUpperCase('pt-BR') + name.slice(1) : null;
}
