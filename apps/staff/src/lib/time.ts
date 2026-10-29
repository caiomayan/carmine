/** Os prazos da Staff por fila: foto denunciada 24 h (ADR 0022), Denúncia de jogo ou de chat 72 h (ADR 0019). */
export const PHOTO_DEADLINE_HOURS = 24;
export const REPORT_DEADLINE_HOURS = 72;

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
