import { type ParseArgsOptionsConfig, parseArgs } from 'node:util';
import type { GameMode } from '@carmine/contracts';
import { assertSandboxEnvironment, DemoNotAllowed } from '../demo/demo-guard.js';
import { type GameServerRegistry, GameServerRegistryError } from './game-server-registry.js';
import {
  LOAD_TEST_DEFAULT_PREFIX,
  LOAD_TEST_MAX_SERVERS,
  LOAD_TEST_PREFIX_PATTERN,
  LOAD_TEST_SECRET_MIN_LENGTH,
  loadTestServerAddress,
  loadTestServerKey,
  loadTestServerName,
} from './load-test-servers.js';

export interface ServersCliDeps {
  registry: GameServerRegistry;
  out: (line: string) => void;
  err: (line: string) => void;
  /** O ambiente do processo; só o `load-test` lê (`LOADTEST_KEY_SECRET` e a trava da homologação). */
  env?: Readonly<Record<string, string | undefined>>;
}

const USAGE = `Uso:
  servers create --name <nome> --mode <retake|deathmatch> --address <host:porta>
  servers rotate-key --name <nome>
  servers retire (--name <nome> | --prefix <início do nome>)
  servers list [--all]
  servers load-test --count <n> [--prefix carga-] [--mode retake|deathmatch]   (só na homologação)`;

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
      case 'retire':
        return await retire(rest, deps);
      case 'list':
        return await list(rest, deps);
      case 'load-test':
        return await loadTest(rest, deps);
      default:
        deps.err(USAGE);
        return 1;
    }
  } catch (error) {
    if (
      error instanceof GameServerRegistryError ||
      error instanceof UsageError ||
      error instanceof DemoNotAllowed
    ) {
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

function parse<const Options extends ParseArgsOptionsConfig>(args: string[], options: Options) {
  try {
    return parseArgs({ args, options, strict: true });
  } catch (error) {
    throw new UsageError(`${(error as Error).message}\n${USAGE}`);
  }
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

/**
 * Aposenta: some da lista pública e do painel, a chave para de valer e o histórico fica. Por
 * prefixo serve para limpar de uma vez, ex.: `--prefix e2e-`.
 */
async function retire(args: string[], deps: ServersCliDeps): Promise<number> {
  const { values } = parse(args, { name: { type: 'string' }, prefix: { type: 'string' } });
  const name = typeof values.name === 'string' ? values.name : '';
  const prefix = typeof values.prefix === 'string' ? values.prefix : '';
  if ((name === '') === (prefix === '')) {
    throw new UsageError(`use --name ou --prefix (um dos dois)\n${USAGE}`);
  }
  const retired = await deps.registry.retire(name ? { name } : { prefix });
  if (retired.length === 0) {
    const what = name ? `o nome "${name}"` : `o prefixo "${prefix}"`;
    throw new UsageError(`nenhum servidor em operação com ${what}`);
  }
  deps.out(`${retired.length} servidor(es) aposentado(s): ${retired.join(', ')}.`);
  deps.out('Eles saem da lista pública e as chaves param de valer; o histórico fica.');
  return 0;
}

async function list(args: string[], deps: ServersCliDeps): Promise<number> {
  const { values } = parse(args, { all: { type: 'boolean' } });
  const servers = await deps.registry.list({ includeRetired: values.all === true });
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
        server.retiredAt
          ? `aposentado em ${server.retiredAt.toISOString()}`
          : `chave de ${server.keyRotatedAt.toISOString()}`,
      ].join('\t'),
    );
  }
  return 0;
}

/**
 * Cadastra (ou refaz) `--count` servidores do teste de carga, `carga-001`... (docs/operacao/teste-de-carga.md).
 * As chaves saem de `LOADTEST_KEY_SECRET` e não são impressas: o gerador de carga as deriva do mesmo
 * segredo. Só roda na homologação (a mesma trava da demonstração). Depois do teste: `retire --prefix carga-`.
 */
async function loadTest(args: string[], deps: ServersCliDeps): Promise<number> {
  const { values } = parse(args, {
    count: { type: 'string' },
    prefix: { type: 'string' },
    mode: { type: 'string' },
  });
  const count = Number(values.count);
  if (!Number.isInteger(count) || count < 1 || count > LOAD_TEST_MAX_SERVERS) {
    throw new UsageError(`--count precisa ser um inteiro de 1 a ${LOAD_TEST_MAX_SERVERS}
${USAGE}`);
  }
  const prefix = typeof values.prefix === 'string' ? values.prefix : LOAD_TEST_DEFAULT_PREFIX;
  if (!LOAD_TEST_PREFIX_PATTERN.test(prefix)) {
    throw new UsageError(`--prefix precisa começar com "carga-" (só minúsculas, dígitos e hífen)
${USAGE}`);
  }
  const mode = (typeof values.mode === 'string' ? values.mode : 'retake') as GameMode;
  const env = deps.env ?? {};
  assertSandboxEnvironment(env);
  const secret = (env.LOADTEST_KEY_SECRET ?? '').trim();
  if (secret.length < LOAD_TEST_SECRET_MIN_LENGTH) {
    throw new UsageError(
      `LOADTEST_KEY_SECRET ausente ou curto (mínimo ${LOAD_TEST_SECRET_MIN_LENGTH} caracteres)`,
    );
  }
  const entries = Array.from({ length: count }, (_, i) => {
    const name = loadTestServerName(prefix, i + 1);
    return {
      name,
      mode,
      address: loadTestServerAddress(i + 1),
      key: loadTestServerKey(secret, name),
    };
  });
  const written = await deps.registry.upsertWithKeys(entries);
  deps.out(
    `${written} servidor(es) do teste de carga prontos (${entries[0]?.name} a ${entries.at(-1)?.name}).`,
  );
  deps.out(`Ao terminar: servers retire --prefix ${prefix}`);
  return 0;
}
