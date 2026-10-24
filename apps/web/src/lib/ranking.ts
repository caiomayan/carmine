import { MODES, type Mode } from './modes';

/** O Modo e a semana pedidos na URL do Ranking (`/ranking?modo=deathmatch&semana=2026-10-12`). */
export interface RankingQuery {
  mode: Mode;
  /** Segunda-feira (`YYYY-MM-DD`); `undefined` é a semana atual. */
  week: string | undefined;
}

const WEEK = /^\d{4}-\d{2}-\d{2}$/;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/**
 * Lê os parâmetros da URL sem confiar neles: Modo desconhecido volta ao Retake e uma semana
 * fora do formato é ignorada (a API ainda valida que é uma segunda-feira passada).
 */
export function parseRankingQuery(params: {
  modo?: string | string[] | undefined;
  semana?: string | string[] | undefined;
}): RankingQuery {
  const mode = MODES.find((m) => m === first(params.modo)) ?? 'retake';
  const week = first(params.semana);
  return { mode, week: WEEK.test(week) ? week : undefined };
}

/** O endereço compartilhável de um Ranking; a semana atual não leva `semana`. */
export function rankingHref(mode: Mode, week?: string, currentWeek?: string): string {
  const query = new URLSearchParams({ modo: mode });
  if (week && week !== currentWeek) query.set('semana', week);
  return `/ranking?${query}`;
}

/** Tempo jogado em horas e minutos (o minuto cheio; segundos soltos não aparecem). */
export function playedParts(seconds: number): { hours: number; minutes: number } {
  const total = Math.floor(seconds / 60);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * As últimas `count` semanas (segundas-feiras, `YYYY-MM-DD`), da atual para trás, no horário de
 * Brasília (UTC−3, sem horário de verão), como o Ranking as conta.
 */
export function recentWeekStarts(now: Date, count: number): string[] {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const mondayOffset = (local.getUTCDay() + 6) % 7;
  const monday =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    mondayOffset * DAY_MS;
  return Array.from({ length: count }, (_, i) =>
    new Date(monday - i * 7 * DAY_MS).toISOString().slice(0, 10),
  );
}

/**
 * O instante em que a semana do Ranking vira: a próxima segunda-feira, 00:00 no horário de Brasília
 * (UTC−3, sem horário de verão), em milissegundos desde a época. Quem chama passa o relógio.
 */
export function nextWeekTurn(now: number): number {
  const [current] = recentWeekStarts(new Date(now), 1);
  return Date.parse(`${current}T00:00:00Z`) + 7 * DAY_MS + 3 * 60 * 60 * 1000;
}

/** O que importa de uma linha para saber se ela andou: quem é e onde está. */
interface RankedRow {
  position: number;
  player: { publicId: number | null };
}

/**
 * Quantas posições cada jogador subiu (positivo) ou caiu (negativo) de uma leitura do Ranking para
 * a seguinte, por `publicId`. Só entra quem apareceu nas duas e mudou de lugar: quem acabou de
 * entrar na lista, quem saiu e o Perfil privado (sem `publicId`, não dá para seguir) ficam de fora.
 * É o único dado das setas ▲▼: elas nunca nascem de simulação, só de uma leitura que de fato mudou.
 */
export function rankingMoves(
  previous: readonly RankedRow[],
  next: readonly RankedRow[],
): Map<number, number> {
  const before = new Map<number, number>();
  for (const row of previous) {
    if (row.player.publicId !== null) before.set(row.player.publicId, row.position);
  }
  const moves = new Map<number, number>();
  for (const row of next) {
    const id = row.player.publicId;
    const was = id === null ? undefined : before.get(id);
    if (id !== null && was !== undefined && was !== row.position) moves.set(id, was - row.position);
  }
  return moves;
}
