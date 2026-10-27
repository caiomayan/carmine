import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O web importa o contrato por domínio (`@carmine/contracts/<módulo>`), nunca pelo índice (issue
 * #138): o índice leva o Zod de todos os domínios para a 1ª carga das páginas, e cada contrato novo
 * (foto de perfil, pagamentos...) estourava o orçamento de JS. Do índice só vêm tipos.
 */
const root = join(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sources(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

const files = sources(root).filter((file) => !file.endsWith('contracts-imports.test.ts'));
const rel = (file: string) => relative(root, file).split(sep).join('/');

describe('imports do contrato no web', () => {
  it('há arquivos para conferir', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('nenhum arquivo importa VALORES do índice de @carmine/contracts (só tipos)', () => {
    const offenders = files.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return [
        ...text.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'@carmine\/contracts';/g),
      ].some(
        (match) =>
          !match[1] &&
          match[2]
            ?.split(',')
            .map((name) => name.trim())
            .some((name) => name && !name.startsWith('type ')),
      );
    });

    expect(
      offenders.map(rel),
      "importe de '@carmine/contracts/<módulo>' (ex.: '@carmine/contracts/profile'); do índice só tipos",
    ).toEqual([]);
  });

  it('ninguém carrega o índice por import() nem usa o loadContracts() (depreciado)', () => {
    const offenders = files.filter((file) => {
      if (file.endsWith(`lib${sep}contracts-schemas.ts`)) return false;
      const text = readFileSync(file, 'utf8');
      return /loadContracts\(|import\('@carmine\/contracts'\)/.test(text);
    });

    expect(
      offenders.map(rel),
      "use await import('@carmine/contracts/<módulo>') com o domínio que precisa",
    ).toEqual([]);
  });
});
