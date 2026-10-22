import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No Tailwind v4, `scale`, `translate` e `rotate` são propriedades CSS próprias. O utilitário
 * `transition-transform` já as inclui, mas um `transition-[transform,opacity]` arbitrário não: o
 * zoom do hover, a entrada e o press saltavam secos. Quem anima `scale-*`, `translate-*` ou
 * `rotate-*` em hover, active, starting ou por estado precisa de `transition-transform` ou de um
 * `transition-[...]` que as liste. E `motion-reduce:transform-none` não cancela `scale`: o movimento reduzido
 * zera a escala com `motion-reduce:...:scale-100`.
 */
const SRC = join(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'animate-ui' ? [] : sources(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

const files = sources(SRC).map((path) => ({
  name: path.slice(SRC.length + 1).replaceAll('\\', '/'),
  text: readFileSync(path, 'utf8'),
}));

type Property = 'scale' | 'translate' | 'rotate';

/** Quantos caracteres em volta contam como "o mesmo elemento" (o `cn(...)` ou o `className`). */
const REACH = 600;

/** Em variante (`hover:`, `group-open/x:`, `data-[state=open]:`...) ou escolhida por condição (`open && 'rotate-180'`). */
const usage = (property: Property) => new RegExp(`:-?${property}-|&&\\s*'-?${property}-`, 'g');
const transitions = (text: string, property: Property) =>
  /transition-transform(?![-\w])/.test(text) ||
  new RegExp(`transition-\\[[^\\]]*\\b${property}\\b`).test(text);

/** Cada uso de `property` sem transição por perto: `arquivo:linha`. */
function withoutTransition(property: Property): string[] {
  return files.flatMap((file) =>
    [...file.text.matchAll(usage(property))]
      .filter((match) => {
        const at = match.index ?? 0;
        const around = file.text.slice(Math.max(0, at - REACH), at + REACH);
        return !transitions(around, property);
      })
      .map((match) => {
        const line = file.text.slice(0, match.index).split('\n').length;
        return `${file.name}:${line}`;
      }),
  );
}

describe('movimento em classes do Tailwind', () => {
  it('a varredura enxerga os componentes (não passa por vazio)', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.some((file) => usage('scale').test(file.text))).toBe(true);
    expect(files.some((file) => usage('rotate').test(file.text))).toBe(true);
  });

  for (const property of ['scale', 'translate', 'rotate'] as const) {
    it(`quem anima ${property}-* em hover, active, starting ou estado tem a transição de ${property} no mesmo elemento`, () => {
      expect(withoutTransition(property)).toEqual([]);
    });
  }

  it('o movimento reduzido zera a escala, não só o transform', () => {
    const wrong = files
      .filter((file) => file.text.includes('motion-reduce:transform-none'))
      .map((file) => file.name);

    expect(wrong).toEqual([]);
  });
});
