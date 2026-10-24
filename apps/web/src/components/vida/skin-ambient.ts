import palettes from './palettes.json';

type Entry = { image?: string; colors: string[] };
const SKINS = Object.values((palettes as unknown as { skins: Record<string, Entry> }).skins);

/** Cores vivas extraídas da imagem da skin (palettes.json, gerado por scripts/vida-palettes.mjs); sem entrada, vazio. */
export function skinPaletteByImage(image: string | null | undefined): string[] | null {
  if (!image) return null;
  return SKINS.find((s) => s.image === image)?.colors ?? null;
}

/**
 * As três cores do brilho ambiente da tela: as da imagem da skin, quando há; senão a cor da raridade. A terceira
 * é a do lado em foco (TR laranja, CT azul), que dá o tom do fundo.
 */
export function ambientFor(
  image: string | null | undefined,
  rarityVar: string | null | undefined,
  sideVar: string,
): [string, string, string] {
  const palette = skinPaletteByImage(image);
  const base = rarityVar ?? 'var(--muted)';
  const a = palette?.[0] ?? base;
  const b = palette?.[1] ?? palette?.[0] ?? base;
  return [a, b, sideVar];
}

/** Âmbar metálico do StatTrak. */
const AMBER: [string, string, string] = ['#ff9a2e', '#ffc873', '#e0701a'];

/**
 * As variáveis do holo (--h1..--h3, lidas por .v-holo no vida.css): o brilho é metálico e tingido pela própria
 * skin: as 2 a 3 cores extraídas da imagem (as mesmas da cor ambiente) ou, sem paleta, a cor da raridade. StatTrak
 * troca para um âmbar metálico que ainda carrega um toque da skin. Nunca o arco-íris.
 */
export function holoStyle(
  image: string | null | undefined,
  rarityVar: string,
  opts: { statTrak?: boolean; palette?: string[] | null } = {},
): Record<string, string> {
  const palette = opts.palette ?? skinPaletteByImage(image);
  const a = palette?.[0] ?? rarityVar;
  const b = palette?.[1] ?? palette?.[0] ?? rarityVar;
  const c = palette?.[2] ?? palette?.[1] ?? palette?.[0] ?? rarityVar;
  if (opts.statTrak) return { '--h1': AMBER[0], '--h2': AMBER[1], '--h3': AMBER[2], '--h0': a };
  return { '--h1': a, '--h2': b, '--h3': c, '--h0': a };
}
