import { parseArgs } from 'node:util';
import type { GameMode } from '@carmine/contracts';
import { type GameServerRegistry, GameServerRegistryError } from './game-server-registry.js';

export interface ServersCliDeps {
  registry: GameServerRegistry;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `Uso:
  servers create --name <nome> --mode <retake|deathmatch> --address <host:porta>
  servers rotate-key --name <nome>
  servers list`;

class UsageError extends Error {}

/** Comandos do CLI de Servidores Carmine. Devolve o código de saída do processo. */
export async function runServersCli(argv: string[], deps: ServersCliDeps): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'create':
        return await create(rest, deps);
      case 'rotate-key':
        return await rotateKey(rest, deps);
      case 'list':
        return await list(deps);
      default:
        deps.err(USAGE);
        return 1;
    }
  } catch (error) {
    if (error instanceof GameServerRegistryError || error instanceof UsageError) {
      deps.err(`Erro: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

/** Lê as opções `--nome valor` exigidas pelo comando; todas são obrigatórias. */
function requiredOptions<const Name extends string>(
  args: string[],
  names: readonly Name[],
): Record<Name, string> {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args,
      options: Object.fromEntries(names.map((name) => [name, { type: 'string' }])),
      strict: true,
    }));
  } catch (error) {
    throw new UsageError(`${(error as Error).message}\n${USAGE}`);
  }
  const missing = names.filter((name) => typeof values[name] !== 'string' || values[name] === '');
  if (missing.length > 0) {
    throw new UsageError(`faltam ${missing.map((name) => `--${name}`).join(', ')}\n${USAGE}`);
  }
  return values as Record<Name, string>;
}

function printKey(key: string, deps: ServersCliDeps): void {
  deps.out('');
  deps.out(`  Chave: ${key}`);
  deps.out('');
  deps.out('  Ela não será mostrada de novo. Cole-a em "ApiKey" na config do Carmine.Core');
  deps.out('  (addons/counterstrikesharp/configs/plugins/Carmine.Core/Carmine.Core.json).');
}

async function create(args: string[], deps: ServersCliDeps): Promise<number> {
  const { name, mode, address } = requiredOptions(args, ['name', 'mode', 'address']);
  const { server, key } = await deps.registry.register({
    name,
    mode: mode as GameMode,
    address,
  });
  deps.out(`Servidor "${server.name}" (${server.mode}, ${server.address}) cadastrado.`);
  printKey(key, deps);
  return 0;
}

async function rotateKey(args: string[], deps: ServersCliDeps): Promise<number> {
  const { name } = requiredOptions(args, ['name']);
  const key = await deps.registry.rotateKey(name);
  deps.out(`Chave do servidor "${name}" rotacionada; a anterior já não funciona.`);
  printKey(key, deps);
  return 0;
}

async function list(deps: ServersCliDeps): Promise<number> {
  const servers = await deps.registry.list();
  if (servers.length === 0) {
    deps.out('Nenhum Servidor Carmine cadastrado.');
    return 0;
  }
  for (const server of servers) {
    deps.out(
      [
        server.name,
        server.mode,
        server.address,
        `chave de ${server.keyRotatedAt.toISOString()}`,
      ].join('\t'),
    );
  }
  return 0;
}
