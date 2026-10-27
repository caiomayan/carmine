import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('.', import.meta.url);
const modules = readdirSync(dir).filter(
  (name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'),
);
const source = (name: string) => readFileSync(new URL(name, dir), 'utf8');

/**
 * Cada módulo de `src/` é um subpath de `@carmine/contracts` (`exports: "./*"`): o cliente importa só
 * o domínio de que precisa (issue #138). Sem passar pelo índice, quem configura o Zod para o
 * navegador (`zod-jitless`) não roda, e o Zod tentaria um `new Function` que a CSP do web registra
 * como violação. Por isso todo módulo que cria schema o importa.
 */
describe('módulos do contrato como subpaths', () => {
  const withSchemas = modules.filter(
    (name) => name !== 'zod-jitless.ts' && /from 'zod'/.test(source(name)),
  );

  it('há módulos com schemas para conferir', () => {
    expect(withSchemas.length).toBeGreaterThan(15);
  });

  it.each(withSchemas)('%s importa o zod-jitless', (name) => {
    expect(source(name)).toContain("import './zod-jitless.js';");
  });

  it('o índice reexporta cada módulo (a API continua importando de um lugar só), menos os que são só para o cliente', () => {
    const index = source('index.ts');
    // Estes ficam de fora do índice de propósito (peso no JS do cliente; ver avatar.ts e rules.ts; analytics.ts é só da API).
    const subpathOnly = new Set([
      'rules.ts',
      'avatar.ts',
      'avatar-rules.ts',
      'avatar-url.ts',
      'analytics.ts',
    ]);
    for (const name of modules) {
      if (['index.ts', 'zod-jitless.ts'].includes(name) || subpathOnly.has(name)) continue;
      expect(index, name).toContain(`'./${name.replace('.ts', '.js')}'`);
    }
  });
});
