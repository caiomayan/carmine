import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O GSAP só existe no Sobre e o three.js só na carta (decisão do dono): quem importa essas bibliotecas fora dos
 * diretórios dos protótipos puxaria o peso delas para as outras páginas. Este teste varre o código do web.
 */
const SRC = join(__dirname, '..', '..');
const ALLOWED: Record<string, string[]> = {
  gsap: [`components${sep}proto-sobre`],
  three: [`components${sep}proto-carta`],
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Qualquer menção à biblioteca como módulo: `from 'x'`, `import('x')` ou `import 'x'`. */
const mention = (library: string) =>
  new RegExp(`(?:from|import)\\s*\\(?\\s*['"]${library}(?:/[^'"]*)?['"]`);

/** Só o `import ... from 'x'` no começo de uma linha (estático); `import type` não pesa no pacote. */
const staticImport = (library: string) =>
  new RegExp(`^import\\s+(?!type\\b)[^;]*?from\\s+['"]${library}(?:/[^'"]*)?['"]`, 'm');

describe('bibliotecas pesadas só onde foram aprovadas', () => {
  for (const [library, allowed] of Object.entries(ALLOWED)) {
    it(`${library} só é mencionado em ${allowed.join(', ')}`, () => {
      const pattern = mention(library);
      const offenders = files(SRC)
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map((file) => relative(SRC, file))
        .filter((file) => !allowed.some((dir) => file.startsWith(dir)));
      expect(offenders).toEqual([]);
    });

    it(`${library} nunca é importado estaticamente (só por import())`, () => {
      const pattern = staticImport(library);
      const offenders = files(SRC)
        .filter((file) => pattern.test(readFileSync(file, 'utf8')))
        .map((file) => relative(SRC, file));
      expect(offenders).toEqual([]);
    });
  }

  it('o varredor acha de verdade: reconhece as duas formas de import', () => {
    expect(mention('gsap').test("const { gsap } = await import('gsap');")).toBe(true);
    expect(mention('gsap').test("import { ScrollTrigger } from 'gsap/ScrollTrigger';")).toBe(true);
    expect(staticImport('gsap').test("import { gsap } from 'gsap';")).toBe(true);
    expect(staticImport('gsap').test("import type { gsap } from 'gsap';")).toBe(false);
    expect(staticImport('gsap').test("const x = await import('gsap');")).toBe(false);
  });
});
