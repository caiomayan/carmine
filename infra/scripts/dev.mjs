// `pnpm dev`: sobe o Postgres e o Valkey e roda `turbo run dev`.
//
// Por que não direto no package.json: no Windows, o turbo roda cada tarefa pelo `pnpm` que acha
// no PATH. Com o pnpm instalado por `npm i -g`, esse é o `pnpm.cmd`, um arquivo em lotes, e o
// cmd.exe responde ao Ctrl+C com "Deseja finalizar o arquivo em lotes (S/N)?" dentro do
// pseudo-console da tarefa, onde ninguém responde: o turbo fica em "3 tasks shutting down..."
// até o segundo Ctrl+C, que mata à força. Pondo antes no PATH a pasta do executável do pnpm que
// rodou este script (`npm_execpath`, o `pnpm.exe`), o turbo usa o .exe e o primeiro Ctrl+C
// encerra tudo. Este script também é chamado sem passar por um .cmd (`node ...`), então não há
// prompt de lotes na raiz.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// biome-ignore lint/suspicious/noUndeclaredEnvVars: roda antes do turbo, fora de qualquer tarefa.
const pnpmPath = process.env.npm_execpath;

if (process.platform === 'win32' && pnpmPath && extname(pnpmPath).toLowerCase() === '.exe') {
  // process.env é insensível a maiúsculas no Windows: isto altera o "Path" do sistema.
  process.env.PATH = `${dirname(pnpmPath)};${process.env.PATH}`;
}

/** O pnpm que rodou este script, sem shell (um .exe direto, ou um .js pelo node). */
function pnpm(args) {
  if (!pnpmPath) return ['pnpm', args, { shell: true }];
  return /\.[cm]?js$/.test(pnpmPath)
    ? [process.execPath, [pnpmPath, ...args], {}]
    : [pnpmPath, args, {}];
}

const [command, args, options] = pnpm(['infra:up']);
const infra = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
if (infra.status !== 0) {
  process.exit(infra.status ?? 1);
}

const turbo = spawn(process.execPath, [join(root, 'node_modules/turbo/bin/turbo'), 'run', 'dev'], {
  cwd: root,
  stdio: 'inherit',
});
// O Ctrl+C é do turbo (que encerra as tarefas com calma); este processo só espera ele sair.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => turbo.kill('SIGTERM'));
turbo.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
