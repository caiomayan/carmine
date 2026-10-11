/** Um Período VIP (`VipPeriod`): VIP de `startsAt` (inclusive) até `endsAt` (exclusive). */
export interface VipPeriod {
  startsAt: Date;
  endsAt: Date;
}

/** VIP de uma Conta num instante. `endsAt` é nulo sem VIP ativo. */
export interface VipStatusAt {
  active: boolean;
  endsAt: Date | null;
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
  return endsAt === null ? { active: false, endsAt: null } : { active: true, endsAt };
}
