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
  let cursor = start.getTime();
  while (cursor < end.getTime()) {
    const weekStart = weekStartInstant(new Date(cursor));
    const nextWeek = weekStart + 7 * DAY_MS - BRASILIA_OFFSET_MS;
    const pieceEnd = Math.min(end.getTime(), nextWeek);
    const seconds = Math.floor((pieceEnd - cursor) / 1000);
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
