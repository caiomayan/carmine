import { parseArgs } from 'node:util';
import { steamId64Schema } from '@carmine/contracts';
import {
  AccountAlreadyAnonymized,
  type AccountErasure,
  AccountIsStaff,
} from './account-erasure.js';

export interface AccountsCliDeps {
  /** O id interno da Conta pelo ID público, ou `null` se ela não existe. */
  findAccountId: (publicId: number) => Promise<string | null>;
  erasure: AccountErasure;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `Uso:
  accounts anonymize --public-id <ID público> --by <SteamID64 de quem faz> --reason "<motivo>"`;

class UsageError extends Error {}

/**
 * CLI das Contas: executa um pedido de exclusão de dados (S08) que chegou pelo contato ou pelo
 * e-mail do encarregado, como o painel da Staff faz (só o Dono). Vai para o log de auditoria.
 * Devolve o código de saída do processo.
 */
export async function runAccountsCli(argv: string[], deps: AccountsCliDeps): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'anonymize':
        return await anonymize(rest, deps);
      default:
        deps.err(USAGE);
        return 1;
    }
  } catch (error) {
    if (error instanceof UsageError) {
      deps.err(`Erro: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

async function anonymize(args: string[], deps: AccountsCliDeps): Promise<number> {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        'public-id': { type: 'string' },
        by: { type: 'string' },
        reason: { type: 'string' },
      },
      strict: true,
    }));
  } catch (error) {
    throw new UsageError(`${(error as Error).message}\n${USAGE}`);
  }
  const value = (name: string) => (typeof values[name] === 'string' ? values[name].trim() : '');
  const publicId = value('public-id').replace(/^#/, '');
  if (!/^[1-9]\d{0,14}$/.test(publicId)) {
    throw new UsageError(`--public-id precisa ser o ID público da Conta (ex.: 10016)\n${USAGE}`);
  }
  if (!steamId64Schema.safeParse(value('by')).success) {
    throw new UsageError(`--by precisa ser o SteamID64 de uma conta individual\n${USAGE}`);
  }
  if (value('reason') === '') {
    throw new UsageError(`--reason é obrigatório: vai para o log de auditoria\n${USAGE}`);
  }
  const accountId = await deps.findAccountId(Number(publicId));
  if (accountId === null) throw new UsageError(`nenhuma Conta com o ID público ${publicId}`);
  try {
    const erasure = await deps.erasure.anonymize(accountId, {
      actorSteamId: value('by'),
      reason: value('reason'),
    });
    deps.out(`Conta #${publicId} anonimizada; o Perfil público já responde 404.`);
    if (erasure.steamIdRetained) {
      deps.out('Há um ban valendo: o SteamID64 fica na Conta até ele acabar, e depois some.');
    }
    if (!erasure.sessionsDropped) {
      deps.err('Aviso: as sessões do site não caíram (Valkey fora); elas expiram sozinhas.');
    }
    return 0;
  } catch (error) {
    if (error instanceof AccountAlreadyAnonymized || error instanceof AccountIsStaff) {
      throw new UsageError(`#${publicId}: ${error.message}`);
    }
    throw error;
  }
}
