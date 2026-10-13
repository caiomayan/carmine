import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Banco próprio do E2E (`carmine_e2e`, no Postgres do Compose): a API do E2E e os CLIs de operação
 * chamados pelos testes usam só ele, então o E2E não deixa lixo no banco de desenvolvimento. O
 * globalSetup o esvazia a cada execução (apps/api/test/support/e2e-database.cli.ts).
 */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://carmine:carmine@localhost:5432/carmine_e2e';

export const API_DIR = path.resolve(import.meta.dirname, '../../api');

/**
 * Roda um CLI de operação da API (como a Staff faz) contra o banco do E2E. `script` é relativo a
 * `apps/api` (ex.: `dist/vip/vip.cli.js`). Devolve a saída padrão.
 */
export function runApiCli(script: string, args: string[]): string {
  return execFileSync(
    process.execPath,
    ['--env-file=.env.example', '--env-file-if-exists=.env', script, ...args],
    {
      cwd: API_DIR,
      encoding: 'utf8',
      // O ambiente vence os arquivos do --env-file.
      env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    },
  );
}
