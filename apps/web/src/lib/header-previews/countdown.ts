const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type ClosesIn =
  | { unit: 'days'; days: number; hours: number; minutes: number }
  | { unit: 'hours'; days: number; hours: number; minutes: number }
  | { unit: 'minutes'; days: number; hours: number; minutes: number }
  | { unit: 'closed' };

/**
 * Quanto falta para a semana do Ranking fechar (`closesAt`, segunda 00:00 em Brasília). A unidade
 * maior que ainda vale é a que o painel mostra: dias e horas, horas e minutos, ou só os minutos
 * (arredondados para cima, para nunca mostrar "0 min" antes de fechar).
 */
export function closesIn(closesAt: string, now: number): ClosesIn {
  const end = new Date(closesAt).getTime();
  if (!Number.isFinite(end) || end <= now) return { unit: 'closed' };
  const left = end - now;
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / HOUR);
  const minutes = Math.floor((left % HOUR) / MINUTE);
  if (days > 0) return { unit: 'days', days, hours, minutes };
  if (hours > 0) return { unit: 'hours', days, hours, minutes };
  return { unit: 'minutes', days, hours, minutes: Math.max(1, Math.ceil(left / MINUTE)) };
}
