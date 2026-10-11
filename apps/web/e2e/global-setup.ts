import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

/**
 * Cadastra um Servidor Carmine só para esta execução, pelo CLI da API (como a Staff faz), e
 * deixa a chave em E2E_SERVER_KEY: os testes registram connects com ela para criar Contas
 * que jogaram mas nunca entraram no site (Contas não reivindicadas).
 */
export default function globalSetup() {
  const apiDir = path.resolve(import.meta.dirname, '../../api');
  const name = `e2e-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const output = execFileSync(
    process.execPath,
    [
      '--env-file=.env.example',
      '--env-file-if-exists=.env',
      'dist/game-servers/servers.cli.js',
      'create',
      '--name',
      name,
      '--mode',
      'retake',
      '--address',
      '127.0.0.1:27015',
    ],
    { cwd: apiDir, encoding: 'utf8' },
  );
  const key = /Chave: (\S+)/.exec(output)?.[1];
  if (!key) throw new Error(`O CLI de servidores não devolveu a chave:\n${output}`);
  process.env.E2E_SERVER_KEY = key;
}
