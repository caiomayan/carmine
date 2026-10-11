import { parseArgs } from 'node:util';
import { steamId64Schema } from '@carmine/contracts';
import type { VipPeriods } from './vip-periods.js';

export interface VipCliDeps {
  /** O id interno da Conta do SteamID64, ou `null` se ela não existe. */
  findAccountId: (steamId: string) => Promise<string | null>;
  vipPeriods: VipPeriods;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `Uso:
  vip grant --steam-id <SteamID64> --days <dias>
  vip status --steam-id <SteamID64>`;

/** Até 10 anos de uma vez: mais que isso é erro de digitação. */
const MAX_DAYS = 3650;

class UsageError extends Error {}

/**
 * CLI de operação e testes do VIP (S04): concede dias de VIP a uma Conta existente sem
 * pagamento, para o beta e os E2E. Não substitui a concessão pela Staff (S05, com auditoria).
 * Devolve o código de saída do processo.
 */
export async function runVipCli(argv: string[], deps: VipCliDeps): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'grant':
        return await grant(rest, deps);
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

function options(args: string[], withDays: boolean): { steamId: string; days: number } {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args,
      options: { 'steam-id': { type: 'string' }, ...(withDays && { days: { type: 'string' } }) },
      strict: true,
    }));
  } catch (error) {
    throw new UsageError(`${(error as Error).message}\n${USAGE}`);
  }
  const steamId = steamId64Schema.safeParse(values['steam-id']);
  if (!steamId.success) {
    throw new UsageError(`--steam-id precisa ser o SteamID64 de uma conta individual\n${USAGE}`);
  }
  const days = Number(values.days ?? 0);
  if (withDays && !(Number.isInteger(days) && days >= 1 && days <= MAX_DAYS)) {
    throw new UsageError(`--days precisa ser um inteiro de 1 a ${MAX_DAYS}\n${USAGE}`);
  }
  return { steamId: steamId.data, days };
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

function describe(steamId: string, vip: Awaited<ReturnType<VipPeriods['statusOf']>>): string {
  return vip.endsAt === null
    ? `${steamId}: sem VIP`
    : `${steamId}: VIP até ${vip.endsAt.toISOString()}`;
}

async function grant(args: string[], deps: VipCliDeps): Promise<number> {
  const { steamId, days } = options(args, true);
  const vip = await deps.vipPeriods.grant(await accountOf(steamId, deps), days);
  deps.out(`+${days} dia(s). ${describe(steamId, vip)}`);
  return 0;
}

async function status(args: string[], deps: VipCliDeps): Promise<number> {
  const { steamId } = options(args, false);
  deps.out(describe(steamId, await deps.vipPeriods.statusOf(await accountOf(steamId, deps))));
  return 0;
}
