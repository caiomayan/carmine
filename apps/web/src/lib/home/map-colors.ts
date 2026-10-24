/**
 * As três variáveis de cor de um cartão de mapa (`--v-map`, `--v-map-deep`, `--v-map-ink`), calculadas a partir
 * das cores vivas da arte do dia. A cor vira o selo do Modo e a barra; a "funda" tinge o meio do cartão; a "tinta"
 * é o texto que fica sobre a cor, escolhido pelo contraste (nunca cinza sobre cor viva).
 */

const DARK_INK = '#0b0b0b';
const LIGHT_INK = '#ffffff';

/** `#rgb` ou `#rrggbb` em [r, g, b] de 0 a 255; nulo se não for uma cor assim. */
function rgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  const digits = match?.[1];
  if (!digits) return null;
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((d) => d + d)
          .join('')
      : digits;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminância relativa (WCAG), de 0 a 1. */
function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** A cor do texto sobre `background` com o maior contraste entre o quase preto e o branco. */
export function inkOn(background: string): string {
  const parsed = rgb(background);
  if (!parsed) return DARK_INK;
  const l = luminance(parsed);
  return contrast(l, luminance([11, 11, 11])) >= contrast(l, 1) ? DARK_INK : LIGHT_INK;
}

export type MapVars = { '--v-map': string; '--v-map-deep': string; '--v-map-ink': string };

/** As variáveis do cartão; sem cores (mapa sem arte), um cinza neutro que não finge ser a cor de um mapa. */
export function mapVars(colors: readonly string[] | null | undefined): MapVars {
  const main = colors?.[0] ?? '#8a8a8a';
  return {
    '--v-map': main,
    '--v-map-deep': `color-mix(in srgb, ${colors?.[2] ?? colors?.[1] ?? main} 52%, #000)`,
    '--v-map-ink': inkOn(main),
  };
}
