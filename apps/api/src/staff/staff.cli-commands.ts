import { parseArgs } from 'node:util';
import { type StaffRole, staffRoleSchema, steamId64Schema } from '@carmine/contracts';
import { AccountNotClaimed, LastOwner, type StaffRoles } from './staff-roles.js';

export interface StaffCliDeps {
  /** O id interno da Conta do SteamID64, ou `null` se ela não existe. */
  findAccountId: (steamId: string) => Promise<string | null>;
  roles: StaffRoles;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `Uso:
  staff grant  --steam-id <SteamID64> --role <owner|admin|moderator> --by <SteamID64 de quem faz> --reason "<motivo>"
  staff revoke --steam-id <SteamID64> --by <SteamID64 de quem faz> --reason "<motivo>"
  staff list`;

const ROLE_NAMES: Record<StaffRole, string> = {
  owner: 'Dono',
  admin: 'Admin',
  moderator: 'Moderador',
};

class UsageError extends Error {}

/**
 * CLI dos papéis da Staff (S07). Cria o primeiro Dono (no painel, só um Dono altera papéis) e
 * serve de recuperação; toda mudança vai para o log de auditoria. A Conta precisa ter feito login
 * no site. Devolve o código de saída do processo.
 */
export async function runStaffCli(argv: string[], deps: StaffCliDeps): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'grant':
        return await change(rest, deps, true);
      case 'revoke':
        return await change(rest, deps, false);
      case 'list':
        return await list(deps);
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

function options(args: string[], withRole: boolean) {
  const names = ['steam-id', 'by', 'reason', ...(withRole ? ['role'] : [])];
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args,
      options: Object.fromEntries(names.map((name) => [name, { type: 'string' as const }])),
      strict: true,
    }));
  } catch (error) {
    throw new UsageError(`${(error as Error).message}\n${USAGE}`);
  }
  const value = (name: string) => (typeof values[name] === 'string' ? values[name] : '');
  for (const name of ['steam-id', 'by']) {
    if (!steamId64Schema.safeParse(value(name)).success) {
      throw new UsageError(`--${name} precisa ser o SteamID64 de uma conta individual\n${USAGE}`);
    }
  }
  if (value('reason').trim() === '') {
    throw new UsageError(`--reason é obrigatório: vai para o log de auditoria\n${USAGE}`);
  }
  const role = withRole ? staffRoleSchema.safeParse(value('role')) : null;
  if (role && !role.success) {
    throw new UsageError(`--role precisa ser owner, admin ou moderator\n${USAGE}`);
  }
  return {
    steamId: value('steam-id'),
    by: value('by'),
    reason: value('reason').trim(),
    role: role?.success ? role.data : null,
  };
}

async function change(args: string[], deps: StaffCliDeps, grant: boolean): Promise<number> {
  const { steamId, by, reason, role } = options(args, grant);
  const accountId = await deps.findAccountId(steamId);
  if (accountId === null) {
    throw new UsageError(`nenhuma Conta com o SteamID64 ${steamId} (faça login no site antes)`);
  }
  try {
    const before = await deps.roles.set(accountId, role, { actorSteamId: by, reason });
    if (before === role) {
      deps.out(`${steamId} já ${role ? `é ${ROLE_NAMES[role]}` : 'está fora da Staff'}.`);
    } else {
      deps.out(role ? `${steamId} agora é ${ROLE_NAMES[role]}.` : `${steamId} saiu da Staff.`);
    }
    return 0;
  } catch (error) {
    if (error instanceof AccountNotClaimed || error instanceof LastOwner) {
      throw new UsageError(`${steamId}: ${error.message}`);
    }
    throw error;
  }
}

async function list(deps: StaffCliDeps): Promise<number> {
  const members = await deps.roles.members();
  if (members.length === 0) {
    deps.out('Ninguém na Staff. Crie o primeiro Dono com: staff grant --role owner ...');
    return 0;
  }
  for (const member of members) {
    deps.out(
      [ROLE_NAMES[member.role], member.steamId, `#${member.publicId}`, member.displayName].join(
        '\t',
      ),
    );
  }
  return 0;
}
