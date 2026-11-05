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

/**
 * Dá à Conta uma foto própria no ar, e com `withPastRemoval` também uma remoção anterior (as fotos não têm armazenamento no E2E, então só a linha existe: o que vale é o
 * estado da ficha da Staff). Insere direto no banco do E2E pelo `pg` da API.
 */
export function seedCustomAvatar(steamId: string, opts: { withPastRemoval?: boolean } = {}): void {
  execFileSync(
    process.execPath,
    [
      '-e',
      `const { Client } = require('pg');
       (async () => {
         const c = new Client({ connectionString: process.env.DATABASE_URL });
         await c.connect();
         const steamId = process.argv[1];
         if (process.argv[2] === 'removal') {
           await c.query(
             "insert into account_avatars (account_id, status, taken_down_at, retired_at, decision, decided_at, decided_by_steam_id, decision_reason, decision_note) select id, 'removed', now(), now(), 'remove', now(), steam_id, 'violence', 'Imagem violenta.' from accounts where steam_id = $1",
             [steamId],
           );
         }
         await c.query("insert into account_avatars (account_id) select id from accounts where steam_id = $1", [steamId]);
         await c.end();
       })().catch((e) => { console.error(e); process.exit(1); });`,
      steamId,
      ...(opts.withPastRemoval ? ['removal'] : []),
    ],
    { cwd: API_DIR, env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL } },
  );
}
