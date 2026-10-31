import { parseArgs } from 'node:util';
import { steamId64Schema } from '@carmine/contracts';
import {
  AccountAlreadyAnonymized,
  type AccountErasure,
  AccountIsStaff,
} from './account-erasure.js';
import {
  AccountPublicIdAlreadyReserved,
  PublicIdOutOfReservedRange,
  PublicIdTaken,
  ReservedIdForAnonymizedAccount,
  type ReservedPublicIds,
} from './reserved-public-ids.js';

export interface AccountsCliDeps {
  /** O id interno da Conta pelo ID público, ou `null` se ela não existe. */
  findAccountId: (publicId: number) => Promise<string | null>;
  /** O id interno da Conta pelo SteamID64, ou `null` se ela não existe. */
  findAccountIdBySteamId: (steamId: string) => Promise<string | null>;
  erasure: AccountErasure;
  reserved: ReservedPublicIds;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `Uso:
  accounts anonymize --public-id <ID público> --by <SteamID64 de quem faz> --reason "<motivo>"
  accounts assign-reserved-id --steam-id <SteamID64> --public-id <1..9999> --by <SteamID64 de quem faz> --reason "<motivo>"`;

class UsageError extends Error {}

/**
 * CLI das Contas: executa um pedido de exclusão de dados (S08) que chegou pelo contato ou pelo
 * e-mail do encarregado, como o painel da Staff faz (só o Dono), e troca o ID automático de uma
 * Conta por um ID reservado (S10). Tudo vai para o log de auditoria. Devolve o código de saída
 * do processo.
 */
export async function runAccountsCli(argv: string[], deps: AccountsCliDeps): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'anonymize':
        return await anonymize(rest, deps);
      case 'assign-reserved-id':
        return await assignReservedId(rest, deps);
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

function parseOptions(args: string[], names: string[]): (name: string) => string {
  try {
    const { values } = parseArgs({
      args,
      options: Object.fromEntries(names.map((name) => [name, { type: 'string' as const }])),
      strict: true,
    });
    return (name) => (typeof values[name] === 'string' ? values[name].trim() : '');
  } catch (error) {
    throw new UsageError(`${(error as Error).message}\n${USAGE}`);
  }
}

/** `--by` e `--reason`, obrigatórios em toda ação da Staff: vão para o log de auditoria. */
function staffAction(value: (name: string) => string) {
  if (!steamId64Schema.safeParse(value('by')).success) {
    throw new UsageError(`--by precisa ser o SteamID64 de uma conta individual\n${USAGE}`);
  }
  if (value('reason') === '') {
    throw new UsageError(`--reason é obrigatório: vai para o log de auditoria\n${USAGE}`);
  }
  return { actorSteamId: value('by'), reason: value('reason') };
}

async function anonymize(args: string[], deps: AccountsCliDeps): Promise<number> {
  const value = parseOptions(args, ['public-id', 'by', 'reason']);
  const publicId = value('public-id').replace(/^#/, '');
  if (!/^[1-9]\d{0,14}$/.test(publicId)) {
    throw new UsageError(`--public-id precisa ser o ID público da Conta (ex.: 10016)\n${USAGE}`);
  }
  const staff = staffAction(value);
  const accountId = await deps.findAccountId(Number(publicId));
  if (accountId === null) throw new UsageError(`nenhuma Conta com o ID público ${publicId}`);
  try {
    const erasure = await deps.erasure.anonymize(accountId, staff);
    deps.out(`Conta #${publicId} anonimizada; o Perfil público já responde 404.`);
    if (erasure.steamIdRetained) {
      deps.out('Há um ban valendo: o SteamID64 fica na Conta até ele acabar, e depois some.');
    }
    if (erasure.analytics === 'pending') {
      deps.err(
        `Aviso: não deu para apagar a pessoa no PostHog; apague a pessoa ${accountId} (distinct_id) à mão no painel (docs/operacao/exclusao-de-dados.md).`,
      );
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

async function assignReservedId(args: string[], deps: AccountsCliDeps): Promise<number> {
  const value = parseOptions(args, ['steam-id', 'public-id', 'by', 'reason']);
  const steamId = value('steam-id');
  if (!steamId64Schema.safeParse(steamId).success) {
    throw new UsageError(`--steam-id precisa ser o SteamID64 de uma conta individual\n${USAGE}`);
  }
  const publicId = Number(value('public-id').replace(/^#/, ''));
  if (!Number.isInteger(publicId) || publicId < 1 || publicId > 9999) {
    throw new UsageError(`--public-id precisa ser um ID reservado, de 1 a 9999\n${USAGE}`);
  }
  const staff = staffAction(value);
  const accountId = await deps.findAccountIdBySteamId(steamId);
  if (accountId === null) {
    throw new UsageError(
      `nenhuma Conta com o SteamID64 ${steamId} (ela nasce no primeiro connect em um servidor)`,
    );
  }
  try {
    const result = await deps.reserved.assign(accountId, publicId, staff);
    deps.out(`Conta ${steamId}: #${result.previousPublicId} → #${result.publicId}.`);
    deps.out(
      `O link antigo /${result.previousPublicId} responde 301 para /${result.publicId}; no jogo, o ID novo vale no próximo connect.`,
    );
    return 0;
  } catch (error) {
    if (
      error instanceof PublicIdOutOfReservedRange ||
      error instanceof PublicIdTaken ||
      error instanceof AccountPublicIdAlreadyReserved ||
      error instanceof ReservedIdForAnonymizedAccount
    ) {
      throw new UsageError(error.message);
    }
    throw error;
  }
}
