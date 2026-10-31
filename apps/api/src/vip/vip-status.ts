import type { Plan, VipStatus } from '@carmine/contracts';

/** Um Período VIP (`VipPeriod`): VIP de `startsAt` (inclusive) até `endsAt` (exclusive). */
export interface VipPeriod {
  startsAt: Date;
  endsAt: Date;
}

/**
 * VIP de uma Conta num instante. `endsAt` é nulo sem VIP ativo; `endedAt`, o fim do último
 * Período já encerrado, só sem VIP ativo (nulo se nunca houve).
 */
export interface VipStatusAt {
  active: boolean;
  endsAt: Date | null;
  endedAt: Date | null;
}

/**
 * Se há VIP em `now` e até quando ele vai sem interrupção: Períodos encadeados ou sobrepostos
 * (um Pacote comprado com VIP ativo, S14) estendem o fim; depois de um buraco, não contam.
 */
export function vipStatusAt(periods: readonly VipPeriod[], now: Date): VipStatusAt {
  const sorted = [...periods].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  let endsAt: Date | null = null;
  for (const { startsAt, endsAt: periodEnd } of sorted) {
    const reachable = endsAt === null ? startsAt <= now : startsAt <= endsAt;
    if (!reachable || periodEnd <= now) continue;
    if (endsAt === null || periodEnd > endsAt) endsAt = periodEnd;
  }
  if (endsAt !== null) return { active: true, endsAt, endedAt: null };
  let endedAt: Date | null = null;
  for (const { endsAt: periodEnd } of sorted) {
    if (periodEnd <= now && (endedAt === null || periodEnd > endedAt)) endedAt = periodEnd;
  }
  return { active: false, endsAt: null, endedAt };
}

/** O VIP no formato do contrato (`VipStatus`); com o plano (S20), leva o plano e se é de teste. */
export function toVipStatus(vip: VipStatusAt & { plan?: Plan | null; test?: boolean }): VipStatus {
  return {
    active: vip.active,
    endsAt: vip.endsAt?.toISOString() ?? null,
    endedAt: vip.endedAt?.toISOString() ?? null,
    ...(vip.plan !== undefined && { plan: vip.plan }),
    ...(vip.test !== undefined && { test: vip.test }),
  };
}
