import { REPORT_REVIEW_DEADLINE_HOURS } from '@carmine/contracts/reports';

/** Os prazos da Staff por fila, os mesmos da API (regra única de denúncia, ADR 0027): foto 24 h, Denúncia de jogo 72 h. */
export const PHOTO_DEADLINE_HOURS = REPORT_REVIEW_DEADLINE_HOURS.avatar;
export const REPORT_DEADLINE_HOURS = REPORT_REVIEW_DEADLINE_HOURS.game;

export type Deadline = {
  /** Minutos que faltam (negativo: venceu). */
  leftMin: number;
  /** Fração do prazo que ainda resta, de 0 a 1 (a barra esvazia com o tempo). */
  remaining: number;
  tone: 'ok' | 'warn' | 'danger';
  label: string;
};

/** O prazo de uma fila a partir de quando o item chegou. Perde cor quando faltam menos de 12,5% e menos de 25%. */
export function deadlineOf(createdAtIso: string, totalHours: number, nowMs: number): Deadline {
  const total = totalHours * 60;
  const elapsed = Math.floor((nowMs - new Date(createdAtIso).getTime()) / 60_000);
  const leftMin = total - elapsed;
  const remaining = Math.min(1, Math.max(0, leftMin / total));
  const tone = remaining < 0.125 ? 'danger' : remaining < 0.25 ? 'warn' : 'ok';
  const abs = Math.abs(leftMin);
  const text =
    abs >= 60 ? `${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, '0')} min` : `${abs} min`;
  return {
    leftMin,
    remaining,
    tone,
    label: leftMin < 0 ? `venceu há ${text}` : `${text} restantes`,
  };
}

/**
 * O prazo de um item a partir do `deadlineAt` que a API calcula (regra única de denúncia, ADR 0027). `null` quando a
 * API não dá prazo: o caso já foi decidido, ou todas as Denúncias abertas dele são de quem perdeu peso (sem prazo
 * correndo, nada fica vermelho nem conta como atrasado).
 */
export function deadlineAtOf(
  deadlineAtIso: string | null,
  totalHours: number,
  nowMs: number,
): Deadline | null {
  if (deadlineAtIso === null) return null;
  // O prazo vence em `deadlineAt`; o início dele é `totalHours` antes.
  const startIso = new Date(
    new Date(deadlineAtIso).getTime() - totalHours * 3_600_000,
  ).toISOString();
  return deadlineOf(startIso, totalHours, nowMs);
}

/** O prazo mais perto de vencer entre vários (o que a fila mostra no cartão do Início). */
export function soonest(deadlines: (Deadline | null)[]): Deadline | null {
  let best: Deadline | null = null;
  for (const deadline of deadlines) {
    if (deadline && (best === null || deadline.leftMin < best.leftMin)) best = deadline;
  }
  return best;
}

/** O dia de hoje no horário de Brasília, `AAAA-MM-DD` (os números "do dia" seguem a semana do site). */
export const brasiliaDay = (ms: number) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);

const HOUR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  hourCycle: 'h23',
});
/** "Bom dia", "Boa tarde" ou "Boa noite" no horário de Brasília. */
export function greeting(ms: number): string {
  const hour = Number(HOUR.format(ms));
  return hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
