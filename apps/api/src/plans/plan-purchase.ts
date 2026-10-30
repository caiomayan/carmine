import type { Plan } from '@carmine/contracts';
import { type PeriodRow, planStatusOfPeriods } from './plan-periods.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Um Período como está guardado (`vip_periods`). */
export interface StoredPeriod extends PeriodRow {
  id: string;
}

export interface PlanPurchase {
  plan: Plan;
  days: number;
  /** Compra de teste do beta. */
  test?: boolean;
}

/** Um Período novo. `purchase` é o do pacote (leva o pagamento); `remainder` é o Capo guardado que volta depois. */
export interface NewPeriod extends PeriodRow {
  role: 'purchase' | 'remainder';
}

/**
 * O que gravar em `vip_periods` quando a Conta compra um pacote (ADR 0026): é a mesma regra da agenda das
 * concessões ({@link planTimeline}), escrita como Períodos. Assim as linhas continuam sendo intervalos legíveis
 * pela imagem antiga, e o reembolso segue recuando os Períodos seguintes como hoje.
 * - `truncate`: o Capo em curso acaba agora (os dias que sobravam voltam em `insert`, como `remainder`);
 * - `remove`: Períodos que começavam agora e ficariam vazios;
 * - `shift`: Períodos que andam para frente, `byMs` (a fila que o Padrinho empurra);
 * - `insert`: os Períodos novos.
 */
export interface PurchaseWrites {
  truncate: { id: string; endsAt: Date }[];
  remove: string[];
  shift: { id: string; byMs: number }[];
  insert: NewPeriod[];
}

/**
 * - Sem plano, o pacote começa agora.
 * - **Capo** vai ao fim de tudo o que a Conta tem (o mesmo Capo estende; com Padrinho ativo ele espera na fila, e
 *   soma aos dias de Capo que já esperavam).
 * - **Padrinho** com Padrinho ativo estende o Padrinho e empurra a fila; com Capo ativo começa agora, o Capo é
 *   cortado e os dias que sobravam ficam guardados depois do Padrinho.
 */
export function planPurchase(
  periods: readonly StoredPeriod[],
  now: Date,
  { plan, days, test = false }: PlanPurchase,
): PurchaseWrites {
  const writes: PurchaseWrites = { truncate: [], remove: [], shift: [], insert: [] };
  const duration = days * DAY_MS;
  const live = periods.filter((p) => p.endsAt > now);
  const status = planStatusOfPeriods(live, now);
  const add = (role: NewPeriod['role'], p: Plan, startsAt: Date, ms: number, isTest: boolean) =>
    writes.insert.push({
      role,
      plan: p,
      test: isTest,
      startsAt,
      endsAt: new Date(startsAt.getTime() + ms),
    });
  const shiftFrom = (boundary: Date, skip: string[] = []) => {
    for (const p of live) {
      if (p.startsAt >= boundary && !skip.includes(p.id))
        writes.shift.push({ id: p.id, byMs: duration });
    }
  };

  if (!status.active) {
    add('purchase', plan, now, duration, test);
    return writes;
  }
  if (plan === 'capo') {
    add('purchase', plan, status.endsAt as Date, duration, test);
    return writes;
  }
  if (status.plan === 'padrinho') {
    const runEnd = status.planEndsAt as Date;
    shiftFrom(runEnd);
    add('purchase', plan, runEnd, duration, test);
    return writes;
  }

  // Padrinho sobre Capo ativo: o Capo em curso é cortado agora e o que sobrava volta depois do Padrinho.
  const current = live
    .filter((p) => p.startsAt <= now && now < p.endsAt)
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0] as StoredPeriod;
  const left = current.endsAt.getTime() - now.getTime();
  if (current.startsAt >= now) writes.remove.push(current.id);
  else writes.truncate.push({ id: current.id, endsAt: now });
  shiftFrom(current.endsAt, [current.id]);
  add('purchase', plan, now, duration, test);
  if (left > 0) add('remainder', 'capo', new Date(now.getTime() + duration), left, current.test);
  return writes;
}

/** Aplica as escritas a uma lista de Períodos (o que o banco fará); `newId` dá o ID dos novos. */
export function applyPurchase(
  periods: readonly StoredPeriod[],
  writes: PurchaseWrites,
  newId: () => string,
): StoredPeriod[] {
  const removed = new Set(writes.remove);
  const truncated = new Map(writes.truncate.map((t) => [t.id, t.endsAt]));
  const shifted = new Map(writes.shift.map((s) => [s.id, s.byMs]));
  const kept = periods
    .filter((p) => !removed.has(p.id))
    .map((p) => {
      const by = shifted.get(p.id) ?? 0;
      return {
        ...p,
        startsAt: new Date(p.startsAt.getTime() + by),
        endsAt: truncated.get(p.id) ?? new Date(p.endsAt.getTime() + by),
      };
    });
  return [
    ...kept,
    ...writes.insert.map(({ role: _role, ...period }) => ({ ...period, id: newId() })),
  ];
}
