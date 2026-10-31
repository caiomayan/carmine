/**
 * Brasília não tem horário de verão desde 2019, então a semana do Ranking (S12) usa o deslocamento
 * fixo de -03:00. Se o horário de verão voltar, este é o único lugar a ajustar.
 */
const BRASILIA_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A segunda-feira (`YYYY-MM-DD`) da semana, no horário de Brasília, em que o instante cai. */
export function weekStartOf(at: Date): string {
  return new Date(weekStartInstant(at)).toISOString().slice(0, 10);
}

/** Um pedaço de uma Sessão de jogo dentro de uma semana. */
export interface WeekSeconds {
  weekStart: string;
  seconds: number;
}

/** Divide `[start, end)` pelas semanas que cruza; vazio quando `end` não vem depois de `start`. */
export function splitByWeek(start: Date, end: Date): WeekSeconds[] {
  const pieces: WeekSeconds[] = [];
  // Arredonda o tempo acumulado desde o início, não cada pedaço: assim os pedaços somam a
  // duração inteira mesmo quando a virada da semana cai no meio de um segundo.
  const elapsed = (at: number) => Math.floor((at - start.getTime()) / 1000);
  let cursor = start.getTime();
  while (cursor < end.getTime()) {
    const weekStart = weekStartInstant(new Date(cursor));
    const nextWeek = weekStart + 7 * DAY_MS - BRASILIA_OFFSET_MS;
    const pieceEnd = Math.min(end.getTime(), nextWeek);
    const seconds = elapsed(pieceEnd) - elapsed(cursor);
    if (seconds > 0) {
      pieces.push({ weekStart: new Date(weekStart).toISOString().slice(0, 10), seconds });
    }
    cursor = pieceEnd;
  }
  return pieces;
}

/** Meia-noite da segunda-feira, como se o horário de Brasília fosse UTC. */
function weekStartInstant(at: Date): number {
  const local = new Date(at.getTime() + BRASILIA_OFFSET_MS);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  return Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - daysSinceMonday,
  );
}

/**
 * Valida o parâmetro de semana do Ranking: precisa ser uma data real e a segunda-feira que abre a
 * semana (`YYYY-MM-DD`). Devolve a própria data, ou `null`.
 */
export function parseWeekStart(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date.getUTCDay() === 1 ? value : null;
}

/** O domingo (`YYYY-MM-DD`) da semana que começa em `weekStart`. */
export function weekEndOf(weekStart: string): string {
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * DAY_MS).toISOString().slice(0, 10);
}

/** O instante em que a semana que começa em `weekStart` fecha: a segunda-feira seguinte, 00:00 de Brasília. */
export function weekClosesAt(weekStart: string): string {
  return new Date(
    Date.parse(`${weekStart}T00:00:00Z`) + 7 * DAY_MS - BRASILIA_OFFSET_MS,
  ).toISOString();
}

/** O dia (`YYYY-MM-DD`), no horário de Brasília, em que o instante cai. */
export function dayOf(at: Date): string {
  return new Date(at.getTime() + BRASILIA_OFFSET_MS).toISOString().slice(0, 10);
}

/** A meia-noite de Brasília que abre o dia em que o instante cai. */
export function dayStartOf(at: Date): Date {
  const local = at.getTime() + BRASILIA_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS - BRASILIA_OFFSET_MS);
}

/** A meia-noite de Brasília que fecha o dia em que o instante cai (abre o seguinte). */
export function nextDayStartOf(at: Date): Date {
  return new Date(dayStartOf(at).getTime() + DAY_MS);
}

/** Um pedaço de uma Sessão de jogo dentro de um dia. */
export interface DaySeconds {
  day: string;
  seconds: number;
}

/**
 * Divide `[start, end)` pelos dias de Brasília que cruza, como {@link splitByWeek} faz com as
 * semanas; vazio quando `end` não vem depois de `start`. Os pedaços somam a duração inteira.
 */
export function splitByDay(start: Date, end: Date): DaySeconds[] {
  const pieces: DaySeconds[] = [];
  const elapsed = (at: number) => Math.floor((at - start.getTime()) / 1000);
  let cursor = start.getTime();
  while (cursor < end.getTime()) {
    const local = cursor + BRASILIA_OFFSET_MS;
    const nextMidnight = (Math.floor(local / DAY_MS) + 1) * DAY_MS - BRASILIA_OFFSET_MS;
    const pieceEnd = Math.min(end.getTime(), nextMidnight);
    const seconds = elapsed(pieceEnd) - elapsed(cursor);
    if (seconds > 0) pieces.push({ day: dayOf(new Date(cursor)), seconds });
    cursor = pieceEnd;
  }
  return pieces;
}

/** A hora cheia (UTC; o fuso de Brasília é de horas inteiras) em que o instante cai. */
export function hourStartOf(at: Date): Date {
  return new Date(Math.floor(at.getTime() / 3_600_000) * 3_600_000);
}
