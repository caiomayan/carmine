import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O GSAP só existe no Sobre e o three.js só na carta (decisão do dono): quem importa essas bibliotecas fora dos
 * módulos dos protótipos puxaria o peso delas para as outras páginas. Cada biblioteca entra por UM módulo (`film.ts`
 * e `lanyard-scene.ts`), que por sua vez só é carregado por `import()` dinâmico: assim a biblioteca fica num chunk
 * sob demanda e o manifesto de chunks do runtime (que vai em toda página) ganha uma entrada, não várias. Este teste
 * varre o código do web.
 */
const SRC = join(__dirname, '..', '..');
const ENTRY: Record<string, string> = {
  gsap: join('components', 'proto-sobre', 'film.ts'),
  three: join('components', 'proto-carta', 'lanyard-scene.ts'),
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const all = files(SRC).map((file) => ({
  file: relative(SRC, file),
  text: readFileSync(file, 'utf8'),
}));

/** Qualquer menção à biblioteca como módulo: `from 'x'`, `import('x')` ou `import 'x'`. */
const mention = (library: string) =>
  new RegExp(`(?:from|import)\\s*\\(?\\s*['"]${library}(?:/[^'"]*)?['"]`);

describe('bibliotecas pesadas só onde foram aprovadas', () => {
  for (const [library, entry] of Object.entries(ENTRY)) {
    it(`${library} só é importado em ${entry}`, () => {
      const pattern = mention(library);
      const offenders = all
        .filter(({ text }) => pattern.test(text))
        .map(({ file }) => file)
        .filter((file) => file !== entry);
      expect(offenders).toEqual([]);
    });
  }

  it('os dois módulos pesados só são carregados por import() dinâmico, nunca estático', () => {
    for (const entry of Object.values(ENTRY)) {
      const name = entry.split(sep).pop()?.replace(/\.ts$/, '') ?? '';
      const staticImport = new RegExp(`^import\\s+[^;]*?from\\s+['"]\\./${name}['"]`, 'm');
      const offenders = all.filter(({ text }) => staticImport.test(text)).map(({ file }) => file);
      expect(offenders, `${entry} importado estaticamente`).toEqual([]);
      const dynamic = new RegExp(`import\\(\\s*['"]\\./${name}['"]\\s*\\)`);
      expect(
        all.some(({ text }) => dynamic.test(text)),
        `${entry} nunca é carregado`,
      ).toBe(true);
    }
  });

  it('o varredor acha de verdade: reconhece as formas de import', () => {
    expect(mention('gsap').test("const { gsap } = await import('gsap');")).toBe(true);
    expect(mention('gsap').test("import { ScrollTrigger } from 'gsap/ScrollTrigger';")).toBe(true);
    expect(mention('three').test("import * as THREE from 'three';")).toBe(true);
    expect(mention('three').test("const x = 'threejs';")).toBe(false);
  });
});
