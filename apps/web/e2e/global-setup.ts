import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { API_DIR, E2E_DATABASE_URL, runApiCli } from './api-cli';

const API_PORT = Number(process.env.API_E2E_PORT ?? 3333);

/**
 * Roda depois de o Playwright subir a API (já migrada no banco do E2E). Esvazia o banco do E2E,
 * para cada execução começar do zero, e cadastra um Servidor Carmine só para esta execução, pelo
 * CLI da API (como a Staff faz), deixando a chave em E2E_SERVER_KEY: os testes registram connects
 * com ela para criar Contas que jogaram mas nunca entraram no site (Contas não reivindicadas).
 */
export default async function globalSetup() {
  execFileSync(process.execPath, ['test/support/e2e-database.cli.ts', 'reset'], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  });
  const name = `e2e-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const output = runApiCli('dist/game-servers/servers.cli.js', [
    'create',
    '--name',
    name,
    '--mode',
    'retake',
    '--address',
    '127.0.0.1:27015',
  ]);
  const key = /Chave: (\S+)/.exec(output)?.[1];
  if (!key) throw new Error(`O CLI de servidores não devolveu a chave:\n${output}`);
  process.env.E2E_SERVER_KEY = key;

  // Uma API reaproveitada (ex.: a do pnpm dev) usaria o banco de desenvolvimento: a chave recém
  // criada no banco do E2E não vale nela.
  const probe = await fetch(`http://localhost:${API_PORT}/api/server/heartbeat`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    // Corpo vazio: com a chave certa dá 400 (nenhum batimento de verdade é registrado).
    body: '{}',
  });
  if (probe.status === 401) {
    throw new Error(
      `A API em :${API_PORT} não usa o banco do E2E (${E2E_DATABASE_URL}). Pare o pnpm dev (ou suba a API com esse DATABASE_URL) e rode de novo.`,
    );
  }
}
