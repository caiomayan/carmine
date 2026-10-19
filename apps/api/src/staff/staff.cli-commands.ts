import { parseArgs } from 'node:util';
import {
  type GameMode,
  gameModeSchema,
  REPORT_REASON_LABELS,
  type StaffRole,
  staffRoleSchema,
  steamId64Schema,
} from '@carmine/contracts';
import type { DisplayNames } from '../accounts/display-names.js';
import { ReportNotFound, ReportNotOpen, type StaffReports } from '../reports/staff-reports.js';
import {
  RankingEntryAlreadyRemoved,
  RankingEntryNotFound,
  type RankingRemovals,
} from '../stats/ranking-removals.js';
import { parseWeekStart } from '../stats/stats-week.js';
import { AccountNotClaimed, LastOwner, type StaffRoles } from './staff-roles.js';

export interface StaffCliDeps {
  /** O id interno da Conta do SteamID64, ou `null` se ela não existe. */
  findAccountId: (steamId: string) => Promise<string | null>;
  roles: StaffRoles;
  displayNames: DisplayNames;
  rankingRemovals: RankingRemovals;
  reports: StaffReports;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `Uso:
  staff grant  --steam-id <SteamID64> --role <owner|admin|moderator> --by <SteamID64 de quem faz> --reason "<motivo>"
  staff revoke --steam-id <SteamID64> --by <SteamID64 de quem faz> --reason "<motivo>"
  staff reset-name --steam-id <SteamID64> --by <SteamID64 de quem faz> --reason "<motivo>"
  staff ranking-remove --steam-id <SteamID64> --mode <retake|deathmatch> --week <segunda-feira YYYY-MM-DD> --by <SteamID64 de quem faz> --reason "<motivo>"
  staff reports
  staff report-archive --id <id da Denúncia> --by <SteamID64 de quem faz> --reason "<motivo>"
  staff list`;

const ROLE_NAMES: Record<StaffRole, string> = {
  owner: 'Dono',
  admin: 'Admin',
  moderator: 'Moderador',
};

class UsageError extends Error {}

/**
 * CLI da Staff (S07 e S11): papéis e reset do Nome de exibição. Cria o primeiro Dono (no painel,
 * só um Dono altera papéis) e
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
      case 'reset-name':
        return await resetName(rest, deps);
      case 'ranking-remove':
        return await rankingRemove(rest, deps);
      case 'reports':
        return await openReports(deps);
      case 'report-archive':
        return await archiveReport(rest, deps);
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

function options(args: string[], withRole: boolean, extra: string[] = []) {
  const names = ['steam-id', 'by', 'reason', ...(withRole ? ['role'] : []), ...extra];
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
    value,
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

async function resetName(args: string[], deps: StaffCliDeps): Promise<number> {
  const { steamId, by, reason } = options(args, false);
  const accountId = await deps.findAccountId(steamId);
  if (accountId === null) {
    throw new UsageError(`nenhuma Conta com o SteamID64 ${steamId}`);
  }
  const account = await deps.displayNames.reset(accountId, { actorSteamId: by, reason });
  deps.out(
    `${steamId} agora aparece como "${account.displayName}" (vale no próximo connect no jogo).`,
  );
  return 0;
}

async function rankingRemove(args: string[], deps: StaffCliDeps): Promise<number> {
  const { steamId, by, reason, value } = options(args, false, ['mode', 'week']);
  const mode = gameModeSchema.safeParse(value('mode'));
  if (!mode.success)
    throw new UsageError(`--mode precisa ser retake ou deathmatch
${USAGE}`);
  const week = parseWeekStart(value('week'));
  if (week === null) {
    throw new UsageError(`--week precisa ser a segunda-feira da semana (YYYY-MM-DD)
${USAGE}`);
  }
  const accountId = await deps.findAccountId(steamId);
  if (accountId === null) throw new UsageError(`nenhuma Conta com o SteamID64 ${steamId}`);
  try {
    await deps.rankingRemovals.remove({ accountId, steamId }, mode.data satisfies GameMode, week, {
      actorSteamId: by,
      reason,
    });
  } catch (error) {
    if (error instanceof RankingEntryNotFound || error instanceof RankingEntryAlreadyRemoved) {
      throw new UsageError(`${steamId}: ${error.message}`);
    }
    throw error;
  }
  deps.out(
    `${steamId} saiu do Ranking de ${mode.data} da semana ${week} (as Estatísticas continuam; some do Ranking em até 1 minuto).`,
  );
  return 0;
}

/** As Denúncias abertas (S13), das mais antigas: o prazo de 72 h corre desde a primeira. */
async function openReports(deps: StaffCliDeps): Promise<number> {
  const { reports, openCount } = await deps.reports.page('open', { limit: 100 });
  if (reports.length === 0) {
    deps.out('Nenhuma Denúncia aberta.');
    return 0;
  }
  for (const report of reports) {
    deps.out(
      [
        report.id,
        report.createdAt,
        REPORT_REASON_LABELS[report.reason],
        `#${report.target.publicId} ${report.target.displayName}`,
        report.server?.code ?? report.server?.name ?? '-',
        `${report.chat.length} linha(s) de chat`,
      ].join('\t'),
    );
  }
  deps.out(
    `${openCount} aberta(s). Para arquivar: staff report-archive --id <id> --by <SteamID64> --reason "..."`,
  );
  return 0;
}

async function archiveReport(args: string[], deps: StaffCliDeps): Promise<number> {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args,
      options: { id: { type: 'string' }, by: { type: 'string' }, reason: { type: 'string' } },
      strict: true,
    }));
  } catch (error) {
    throw new UsageError(`${(error as Error).message}\n${USAGE}`);
  }
  const id = typeof values.id === 'string' ? values.id : '';
  const by = typeof values.by === 'string' ? values.by : '';
  const reason = typeof values.reason === 'string' ? values.reason.trim() : '';
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    throw new UsageError(`--id precisa ser o id da Denúncia (staff reports)\n${USAGE}`);
  }
  if (!steamId64Schema.safeParse(by).success) {
    throw new UsageError(`--by precisa ser o SteamID64 de uma conta individual\n${USAGE}`);
  }
  if (reason === '') {
    throw new UsageError(`--reason é obrigatório: vai para o log de auditoria\n${USAGE}`);
  }
  try {
    await deps.reports.archive(id, { actorSteamId: by, reason });
  } catch (error) {
    if (error instanceof ReportNotFound || error instanceof ReportNotOpen) {
      throw new UsageError(error.message);
    }
    throw error;
  }
  deps.out(`Denúncia ${id} arquivada.`);
  return 0;
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
