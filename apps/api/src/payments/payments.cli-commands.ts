import { parseArgs } from 'node:util';
import { steamId64Schema } from '@carmine/contracts';
import { CompensationAlreadyApplied, type VipCompensation } from '../vip/vip-compensation.js';
import { type Payments, PurchaseRejection } from './payments.js';

export interface PaymentsCliDeps {
  payments: Pick<Payments, 'refundByStaff' | 'reconcile' | 'unblockPurchases' | 'sync'>;
  compensation: Pick<VipCompensation, 'run'>;
  /** O id interno da Conta do SteamID64, ou `null` se ela não existe. */
  findAccountId: (steamId: string) => Promise<string | null>;
  out: (line: string) => void;
  err: (line: string) => void;
}

const USAGE = `Uso:
  payments reconcile [--days <dias, padrão 8>]
  payments refund     --id <pagamento> [--days <dias a devolver; sem ele, o que resta>] --by <SteamID64 da Staff> --reason "<motivo>"
  payments unblock    --steam-id <SteamID64> --by <SteamID64 da Staff> --reason "<motivo>"
  payments compensate --days <dias> --key <chave única> --by <SteamID64 da Staff> --reason "<motivo>"`;

class UsageError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * CLI de operação dos pagamentos (S14): conciliar com o provedor, reembolsar (depois dos 7 dias, ou
 * parcial por indisponibilidade), reabrir as compras de uma Conta bloqueada e compensar os dias de
 * todos os VIPs ativos. Tudo que muda algo vai para o log de auditoria. Devolve o código de saída.
 */
export async function runPaymentsCli(argv: string[], deps: PaymentsCliDeps): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'reconcile':
        return await reconcile(rest, deps);
      case 'refund':
        return await refund(rest, deps);
      case 'unblock':
        return await unblock(rest, deps);
      case 'compensate':
        return await compensate(rest, deps);
      default:
        deps.err(USAGE);
        return 1;
    }
  } catch (error) {
    if (error instanceof UsageError || error instanceof PurchaseRejection) {
      deps.err(`Erro: ${error.message}`);
      return 1;
    }
    if (error instanceof CompensationAlreadyApplied) {
      deps.err(`Erro: ${error.message}`);
      return 1;
    }
    throw error;
  }
}

type Name = 'id' | 'days' | 'by' | 'reason' | 'steam-id' | 'key';

function parse(args: string[], names: Name[]): Partial<Record<Name, string>> {
  try {
    const { values } = parseArgs({
      args,
      options: Object.fromEntries(names.map((name) => [name, { type: 'string' as const }])),
      strict: true,
    });
    return values as Partial<Record<Name, string>>;
  } catch (error) {
    throw new UsageError(`${(error as Error).message}\n${USAGE}`);
  }
}

function need(values: Partial<Record<Name, string>>, name: Name): string {
  const value = values[name]?.trim();
  if (!value) throw new UsageError(`falta --${name}\n${USAGE}`);
  return value;
}

function staff(values: Partial<Record<Name, string>>) {
  const by = need(values, 'by');
  if (!steamId64Schema.safeParse(by).success) {
    throw new UsageError(`--by precisa ser o SteamID64 de uma conta individual\n${USAGE}`);
  }
  return { actorSteamId: by, reason: need(values, 'reason') };
}

function days(value: string | undefined, max: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!(Number.isInteger(parsed) && parsed >= 1 && parsed <= max)) {
    throw new UsageError(`--days precisa ser um inteiro de 1 a ${max}\n${USAGE}`);
  }
  return parsed;
}

async function reconcile(args: string[], deps: PaymentsCliDeps): Promise<number> {
  const values = parse(args, ['days']);
  const back = days(values.days, 400) ?? 8;
  const since = new Date(Date.now() - back * 24 * 60 * 60 * 1000);
  const { checked, changed } = await deps.payments.reconcile({ since });
  deps.out(`${checked} pagamento(s) conferidos com o provedor; ${changed} mudaram.`);
  return 0;
}

async function refund(args: string[], deps: PaymentsCliDeps): Promise<number> {
  const values = parse(args, ['id', 'days', 'by', 'reason']);
  const id = need(values, 'id');
  if (!UUID.test(id))
    throw new UsageError(`--id precisa ser o identificador do pagamento\n${USAGE}`);
  const count = days(values.days, 3650);
  const purchase = await deps.payments.refundByStaff(
    id,
    staff(values),
    count === undefined ? {} : { days: count },
  );
  deps.out(
    `Pagamento ${purchase.id}: ${purchase.status}, R$ ${(purchase.refundedCents / 100).toFixed(2)} devolvidos.`,
  );
  return 0;
}

async function unblock(args: string[], deps: PaymentsCliDeps): Promise<number> {
  const values = parse(args, ['steam-id', 'by', 'reason']);
  const steamId = need(values, 'steam-id');
  if (!steamId64Schema.safeParse(steamId).success) {
    throw new UsageError(`--steam-id precisa ser um SteamID64\n${USAGE}`);
  }
  const accountId = await deps.findAccountId(steamId);
  if (accountId === null) throw new UsageError(`nenhuma Conta com o SteamID64 ${steamId}`);
  const done = await deps.payments.unblockPurchases(accountId, staff(values));
  deps.out(
    done ? `${steamId}: compras liberadas.` : `${steamId}: as compras não estavam bloqueadas.`,
  );
  return 0;
}

async function compensate(args: string[], deps: PaymentsCliDeps): Promise<number> {
  const values = parse(args, ['days', 'key', 'by', 'reason']);
  const count = days(need(values, 'days'), 30) as number;
  const { accounts } = await deps.compensation.run(
    { days: count, key: need(values, 'key') },
    staff(values),
  );
  deps.out(`+${count} dia(s) de VIP para ${accounts} Conta(s) com VIP ativo.`);
  return 0;
}
