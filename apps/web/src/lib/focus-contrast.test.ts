import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * O anel de foco dos campos (`--focus-ring`, em `tokens.css`) precisa passar de 3:1 sobre o fundo
 * onde o campo está, nos dois temas (WCAG 1.4.11, contraste de componentes; 2.4.7, foco visível).
 * Lê os tokens reais: quem mexer na cor ou na opacidade sem querer reprova aqui.
 */
const css = readFileSync(new URL('../app/tokens.css', import.meta.url), 'utf8');

type Rgb = [number, number, number];

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`bloco ${selector} não achado em tokens.css`);
  return css.slice(start, css.indexOf('\n}', start));
}

function hex(source: string, name: string): Rgb {
  const match = new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i').exec(source);
  if (!match?.[1]) throw new Error(`token ${name} não achado`);
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const luminance = ([r, g, b]: Rgb) => {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const over = (top: Rgb, alpha: number, bottom: Rgb): Rgb =>
  top.map((channel, i) => channel * alpha + (bottom[i] as number) * (1 - alpha)) as Rgb;

const ringAlpha = (() => {
  const match = /--focus-ring:\s*color-mix\(in srgb, var\(--text\) (\d+)%/.exec(css);
  if (!match?.[1]) throw new Error('--focus-ring não achado em tokens.css');
  return Number(match[1]) / 100;
})();

describe('anel de foco dos campos', () => {
  for (const [theme, selector] of [
    ['escuro', ':root,\n[data-theme="dark"] {'],
    ['claro', '[data-theme="light"] {'],
  ] as const) {
    const tokens = block(selector);
    const text = hex(tokens, '--text');

    for (const surface of ['--bg', '--surface', '--surface-2'] as const) {
      it(`passa de 3:1 sobre ${surface} no tema ${theme}`, () => {
        const background = hex(tokens, surface);
        const ring = over(text, ringAlpha, background);

        expect(contrast(ring, background)).toBeGreaterThanOrEqual(3);
      });
    }
  }
});
