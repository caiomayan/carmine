const DAY_MS = 86_400_000;

/**
 * Dias que faltam para o fim do Período VIP, para o selo do menu da Conta. Arredonda para cima
 * (no último dia ainda é "1 dia") e devolve `null` sem VIP ativo, sem data de fim ou com o fim já
 * passado (uma aba aberta há tempo): nunca um número que não vale.
 */
export function vipDaysLeft(
  vip: { active: boolean; endsAt: string | null },
  now: Date,
): number | null {
  if (!vip.active || vip.endsAt === null) return null;
  const remaining = new Date(vip.endsAt).getTime() - now.getTime();
  return remaining > 0 ? Math.ceil(remaining / DAY_MS) : null;
}
