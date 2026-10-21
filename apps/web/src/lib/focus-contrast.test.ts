import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * A escala de fundos (`--fill-*`, em `tokens.css`) no lugar dos anéis: repouso, hover, ativo e foco
 * são camadas do texto sobre a superfície do controle. Lê os tokens reais e mede, nos dois temas e
 * sobre as três superfícies, o que a regra do dono precisa garantir:
 * - o texto (e o placeholder, que fica a 90% do texto) continua legível no degrau de foco (4,5:1);
 * - o foco se distingue do repouso e do hover (o foco do teclado não pode ser só um hover).
 *
 * O 3:1 de contraste de componente (WCAG 1.4.11) entre foco e repouso não é alcançável só com fundo
 * sem estragar a leitura do texto: precisaria de ~38% (escuro) e ~49% (claro) do texto por cima, e
 * aí o texto cai abaixo de 4,5:1 nas superfícies mais claras. Por isso o piso aqui é o que cabe
 * (≥ 1,8:1 entre foco e repouso) e os controles pequenos ganham o texto pleno no foco.
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

function percent(source: string, name: string): number {
  const match = new RegExp(`${name}:\\s*color-mix\\(in srgb, var\\(--text\\) (\\d+)%`).exec(source);
  if (!match?.[1]) throw new Error(`token ${name} não achado`);
  return Number(match[1]) / 100;
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

describe('escala de fundos: repouso, hover, ativo e foco', () => {
  for (const [theme, selector] of [
    ['escuro', ':root,\n[data-theme="dark"] {'],
    ['claro', '[data-theme="light"] {'],
  ] as const) {
    const tokens = block(selector);
    const text = hex(tokens, '--text');
    const rest = percent(tokens, '--fill-rest');
    const hover = percent(tokens, '--fill-hover');
    const active = percent(tokens, '--fill-active');
    const focus = percent(tokens, '--fill-focus');

    it(`os degraus crescem e o foco é o mais forte (${theme})`, () => {
      expect(rest).toBeLessThan(hover);
      expect(hover).toBeLessThan(active);
      expect(active).toBeLessThan(focus);
    });

    for (const surface of ['--bg', '--surface', '--surface-2'] as const) {
      const base = hex(tokens, surface);
      const focused = over(text, focus, base);

      it(`texto e placeholder leem no foco sobre ${surface} (${theme})`, () => {
        expect(contrast(text, focused)).toBeGreaterThanOrEqual(4.5);
        // O placeholder vai a 90% do texto enquanto o campo está focado (o campo vazio ainda mostra a dica).
        const placeholder = over(text, 0.9, focused);
        expect(contrast(placeholder, focused)).toBeGreaterThanOrEqual(4.5);
      });

      it(`o foco se distingue do repouso e do hover sobre ${surface} (${theme})`, () => {
        expect(contrast(focused, base)).toBeGreaterThanOrEqual(1.8);
        expect(contrast(focused, over(text, hover, base))).toBeGreaterThanOrEqual(1.25);
        expect(contrast(focused, over(text, rest, base))).toBeGreaterThanOrEqual(1.4);
      });
    }
  }
});
