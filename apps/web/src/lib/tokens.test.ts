import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Os tokens da U3c-1 (escala de texto com piso, raridade, `--faint`, carmim, fonte de destaque e os
 * pequenos tokens de estrutura). Lê `tokens.css` e `globals.css` de verdade: quem mudar um valor
 * sem querer reprova aqui, e os outros PRs da U3c usam estes nomes sem criar tokens paralelos.
 */
const tokensCss = readFileSync(new URL('../app/tokens.css', import.meta.url), 'utf8');
const globalsCss = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

type Rgb = [number, number, number];

function block(selector: string): string {
  const start = tokensCss.indexOf(selector);
  if (start < 0) throw new Error(`bloco ${selector} não achado em tokens.css`);
  return tokensCss.slice(start, tokensCss.indexOf('\n}', start));
}

const THEMES = {
  escuro: block(':root,\n[data-theme="dark"] {'),
  claro: block('[data-theme="light"] {'),
} as const;

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

const px = (css: string, name: string): number => {
  const match = new RegExp(`${name}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(css);
  if (!match?.[1]) throw new Error(`token ${name} (px) não achado`);
  return Number(match[1]);
};

describe('escala de texto: piso de 11 px nos rótulos e 14 px no corpo do celular', () => {
  const label = px(globalsCss, '--text-label');
  const caption = px(globalsCss, '--text-caption');
  const bodySm = px(globalsCss, '--text-body-sm');
  const body = px(globalsCss, '--text-body');

  it('o rótulo (versalete) nunca fica abaixo de 11 px', () => {
    expect(label).toBeGreaterThanOrEqual(11);
  });

  it('os degraus crescem: rótulo < legenda < corpo pequeno <= corpo', () => {
    expect(label).toBeLessThan(caption);
    expect(caption).toBeLessThan(bodySm);
    expect(bodySm).toBeLessThanOrEqual(body);
  });

  it('o texto corrido sobe para 14 px no celular (até 760 px)', () => {
    expect(bodySm).toBeGreaterThanOrEqual(13);
    const mobile = /@media \(max-width: 760px\) \{\s*:root \{[^}]*--text-body-sm:\s*(\d+)px/.exec(
      tokensCss,
    );
    expect(Number(mobile?.[1])).toBeGreaterThanOrEqual(14);
    expect(body).toBeGreaterThanOrEqual(14);
  });
});

describe('--faint: só decoração, mas o ponto offline precisa de 3:1', () => {
  for (const [theme, tokens] of Object.entries(THEMES)) {
    const faint = hex(tokens, '--faint');
    const muted = hex(tokens, '--muted');
    for (const surface of ['--bg', '--surface'] as const) {
      it(`passa de 3:1 sobre ${surface} (${theme})`, () => {
        expect(contrast(faint, hex(tokens, surface))).toBeGreaterThanOrEqual(3);
      });
    }
    it(`continua abaixo do --muted, para a hierarquia não se perder (${theme})`, () => {
      expect(contrast(faint, hex(tokens, '--bg'))).toBeLessThan(
        contrast(muted, hex(tokens, '--bg')),
      );
    });
  }
});

describe('--rarity-*: o ponto de raridade passa de 3:1 sobre as superfícies nos dois temas', () => {
  const RARITIES = [
    'consumer',
    'industrial',
    'milspec',
    'restricted',
    'classified',
    'covert',
    'contraband',
  ] as const;

  for (const [theme, tokens] of Object.entries(THEMES)) {
    for (const rarity of RARITIES) {
      it(`${rarity} (${theme})`, () => {
        const color = hex(tokens, `--rarity-${rarity}`);
        for (const surface of ['--bg', '--surface', '--surface-2'] as const) {
          expect(contrast(color, hex(tokens, surface))).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }
});

describe('--carmine: o acento só no detalhe (◆ dos títulos), 3:1 sobre as superfícies', () => {
  for (const [theme, tokens] of Object.entries(THEMES)) {
    it(`passa de 3:1 sobre bg, surface e surface-2 (${theme})`, () => {
      const carmine = hex(tokens, '--carmine');
      for (const surface of ['--bg', '--surface', '--surface-2'] as const) {
        expect(contrast(carmine, hex(tokens, surface))).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it('o escuro e o claro usam os tons aprovados pelo dono', () => {
    expect(THEMES.escuro).toMatch(/--carmine:\s*#c23a41/i);
    expect(THEMES.claro).toMatch(/--carmine:\s*#a3262d/i);
  });
});

describe('tokens de estrutura e a fonte de destaque', () => {
  it('existem os de estrutura que os outros PRs usam', () => {
    for (const name of ['--shadow-overlay', '--bar-h', '--underline-offset', '--fill-selected']) {
      expect(tokensCss, name).toContain(`${name}:`);
    }
  });

  it('a fonte de destaque é a DM Serif Display (token --font-display, com fallback serifado)', () => {
    expect(globalsCss).toMatch(/--font-display:\s*var\(--font-dm-serif\)[^;]*serif;/);
    const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
    expect(layout).toContain('DM_Serif_Display');
    expect(layout).toContain("variable: '--font-dm-serif'");
  });

  it('as cores novas entram no tema do Tailwind (bg-carmine, text-rarity-covert…)', () => {
    expect(globalsCss).toContain('--color-carmine: var(--carmine)');
    expect(globalsCss).toContain('--color-rarity-covert: var(--rarity-covert)');
  });
});

describe('as classes antigas da escala seguem a escala com nomes', () => {
  it('text-xs, text-sm e text-base apontam para legenda, corpo pequeno e corpo', () => {
    expect(globalsCss).toMatch(/--text-xs:\s*var\(--text-caption\);/);
    expect(globalsCss).toMatch(/--text-sm:\s*var\(--text-body-sm\);/);
    expect(globalsCss).toMatch(/--text-base:\s*var\(--text-body\);/);
  });

  it('nenhum tamanho arbitrário abaixo de 11 px sobrou fora dos arquivos que outros PRs da U3c ainda mexem', () => {
    // A varredura completa vem quando os PRs de hierarquia e acabamento entrarem; aqui só o que é do PR 2.
    const owned = [
      '../components/ui/select.tsx',
      '../components/ui/command.tsx',
      '../components/ui/button.tsx',
      '../components/ui/combobox.tsx',
    ];
    for (const file of owned) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/text-\[(9(\.5)?|10(\.5)?)px\]/);
    }
  });
});
