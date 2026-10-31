import { parseArgs } from 'node:util';
import { PLANS, type Plan, steamId64Schema } from '@carmine/contracts';
import {
  NoVipToRevoke,
  type PlanVipStatus,
  type StaffAction,
  type VipPeriods,
} from './vip-periods.js';
import type { VipStatusAt } from './vip-status.js';

export interface VipCliDeps {
  /** O id interno da Conta do SteamID64, ou `null` se ela não existe. */
  findAccountId: (steamId: string) => Promise<string | null>;
  vipPeriods: VipPeriods;
  /** Tira do cache o `equipped/v5` da Conta, para o jogo ver a mudança no próximo connect/!ws. */
  invalidateEquipped: (steamId: string) => Promise<void>;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `Uso:
  vip grant  --steam-id <SteamID64> --days <dias> [--plan capo|padrinho] [--test] --by <SteamID64 da Staff> --reason "<motivo>"
  vip revoke --steam-id <SteamID64> --by <SteamID64 da Staff> --reason "<motivo>"
  vip status --steam-id <SteamID64>`;

/** Até 10 anos de uma vez: mais que isso é erro de digitação. */
const MAX_DAYS = 3650;

/** Ações da Staff mostradas no `status`. */
const STATUS_AUDIT_LINES = 5;

class UsageError extends Error {}

/**
 * CLI de operação dos planos (S05, S20): a Staff concede (Capo por padrão, ou Padrinho; `--test` para o plano de teste do
 * beta) e revoga Períodos sem pagamento, com registro no log de auditoria (autor, ação, alvo, motivo e horário). O painel da Staff (S07)
 * usa as mesmas operações. Devolve o código de saída do processo.
 */
export async function runVipCli(argv: string[], deps: VipCliDeps): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'grant':
        return await grant(rest, deps);
      case 'revoke':
        return await revoke(rest, deps);
      case 'status':
        return await status(rest, deps);
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

type Option = 'steam-id' | 'days' | 'by' | 'reason' | 'plan';

interface Parsed extends Record<Option, string> {
  test: boolean;
}

function options(args: string[], required: Option[], extras: ('plan' | 'test')[] = []): Parsed {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        ...Object.fromEntries(required.map((name) => [name, { type: 'string' as const }])),
        ...(extras.includes('plan') && { plan: { type: 'string' as const } }),
        ...(extras.includes('test') && { test: { type: 'boolean' as const } }),
      },
      strict: true,
    }));
  } catch (error) {
    throw new UsageError(`${(error as Error).message}\n${USAGE}`);
  }
  const value = (name: Option) => {
    const raw = values[name];
    return typeof raw === 'string' ? raw : '';
  };
  for (const name of ['steam-id', 'by'] as const) {
    if (required.includes(name) && !steamId64Schema.safeParse(value(name)).success) {
      throw new UsageError(`--${name} precisa ser o SteamID64 de uma conta individual\n${USAGE}`);
    }
  }
  if (required.includes('days')) {
    const days = Number(value('days'));
    if (!(Number.isInteger(days) && days >= 1 && days <= MAX_DAYS)) {
      throw new UsageError(`--days precisa ser um inteiro de 1 a ${MAX_DAYS}\n${USAGE}`);
    }
  }
  if (values.plan !== undefined && !(PLANS as readonly string[]).includes(value('plan'))) {
    throw new UsageError(`--plan precisa ser ${PLANS.join(' ou ')}\n${USAGE}`);
  }
  if (required.includes('reason') && value('reason').trim() === '') {
    throw new UsageError(`--reason é obrigatório: vai para o log de auditoria\n${USAGE}`);
  }
  return {
    'steam-id': value('steam-id'),
    days: value('days'),
    by: value('by'),
    reason: value('reason').trim(),
    plan: value('plan'),
    test: values.test === true,
  };
}

async function accountOf(steamId: string, deps: VipCliDeps): Promise<string> {
  const accountId = await deps.findAccountId(steamId);
  if (accountId === null) {
    throw new UsageError(
      `nenhuma Conta com o SteamID64 ${steamId} (ela nasce no connect ou no login)`,
    );
  }
  return accountId;
}

const PLAN_NAMES: Record<Plan, string> = { capo: 'Capo', padrinho: 'Padrinho' };

function describe(steamId: string, vip: VipStatusAt | PlanVipStatus): string {
  if (vip.endsAt === null) return `${steamId}: sem plano`;
  const plan = 'plan' in vip && vip.plan ? PLAN_NAMES[vip.plan] : 'Capo';
  const test = 'test' in vip && vip.test ? ' (teste)' : '';
  return `${steamId}: ${plan}${test} até ${vip.endsAt.toISOString()}`;
}

const staffOf = (values: Record<Option, string>): StaffAction => ({
  actorSteamId: values.by,
  reason: values.reason,
});

async function grant(args: string[], deps: VipCliDeps): Promise<number> {
  const values = options(args, ['steam-id', 'days', 'by', 'reason'], ['plan', 'test']);
  const steamId = values['steam-id'];
  const days = Number(values.days);
  const plan = (values.plan || 'capo') as Plan;
  const accountId = await accountOf(steamId, deps);
  await deps.vipPeriods.grant(accountId, days, new Date(), staffOf(values), {
    plan,
    test: values.test,
  });
  await deps.invalidateEquipped(steamId);
  const status = await deps.vipPeriods.planStatusOf(accountId);
  deps.out(`+${days} dia(s) de ${PLAN_NAMES[plan]}. ${describe(steamId, status)}`);
  return 0;
}

async function revoke(args: string[], deps: VipCliDeps): Promise<number> {
  const values = options(args, ['steam-id', 'by', 'reason']);
  const steamId = values['steam-id'];
  const accountId = await accountOf(steamId, deps);
  try {
    const vip = await deps.vipPeriods.revoke(accountId, staffOf(values));
    await deps.invalidateEquipped(steamId);
    deps.out(`Plano revogado. ${describe(steamId, vip)}`);
    return 0;
  } catch (error) {
    if (error instanceof NoVipToRevoke) throw new UsageError(`${steamId}: ${error.message}`);
    throw error;
  }
}

async function status(args: string[], deps: VipCliDeps): Promise<number> {
  const steamId = options(args, ['steam-id'])['steam-id'];
  const accountId = await accountOf(steamId, deps);
  deps.out(describe(steamId, await deps.vipPeriods.planStatusOf(accountId)));
  for (const entry of await deps.vipPeriods.auditOf(accountId, STATUS_AUDIT_LINES)) {
    deps.out(
      `  ${entry.createdAt.toISOString()} ${entry.action} por ${entry.actorSteamId}: ${entry.reason} ${JSON.stringify(entry.details)}`,
    );
  }
  return 0;
}
