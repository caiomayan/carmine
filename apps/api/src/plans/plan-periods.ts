import type { Plan } from '@carmine/contracts';
import {
  type PlanGrant,
  type PlanStatus,
  type PlanTimelineOptions,
  planStatusAt,
} from './plan-timeline.js';

/** Uma linha de `vip_periods` (nome legado, ADR 0026): o trecho, o plano e se é de teste. */
export interface PeriodRow {
  startsAt: Date;
  endsAt: Date;
  plan: Plan;
  test: boolean;
}

/**
 * Cada Período guardado é uma concessão do plano dele, feita no começo do Período e com a duração dele. Com um
 * plano só isso reproduz o VIP de antes (Períodos encadeados somam, um buraco separa); com os dois planos, a
 * agenda ({@link planStatusAt}) decide quem gasta primeiro e o que fica guardado. A duração vai em milissegundos
 * exatos, para o fim sair no mesmo instante que as linhas guardam.
 */
export function periodsToGrants(rows: readonly PeriodRow[]): PlanGrant[] {
  return rows.map(({ startsAt, endsAt, plan, test }) => ({
    plan,
    at: startsAt,
    days: (endsAt.getTime() - startsAt.getTime()) / (24 * 60 * 60 * 1000),
    ms: endsAt.getTime() - startsAt.getTime(),
    test,
  }));
}

/** O plano de uma Conta em `now`, a partir dos Períodos guardados e das revogações da Staff. */
export function planStatusOfPeriods(
  rows: readonly PeriodRow[],
  now: Date,
  options: PlanTimelineOptions = {},
): PlanStatus {
  return planStatusAt(periodsToGrants(rows), now, options);
}
