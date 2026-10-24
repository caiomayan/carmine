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
