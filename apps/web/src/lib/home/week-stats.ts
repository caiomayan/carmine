import type { WeekSummary, WeekTotals } from '@carmine/contracts';

/**
 * A faixa "Esta semana" da Home: os números da semana de todas as Contas (`GET /api/stats/week`) prontos para
 * desenhar, cada um com a variação sobre a semana anterior. Só números de verdade: nada de "rounds" (a soma por
 * jogador contaria o mesmo round várias vezes) nem de "partidas" (só existem no 5v5, CONTEXT.md).
 */
export type WeekRowKey = 'players' | 'kills' | 'headshotPercent' | 'hours';

/** `percent`: variação em %; `points`: diferença em pontos percentuais (para o HS%). */
export type WeekDelta = {
  kind: 'percent' | 'points';
  direction: 'up' | 'down' | 'same';
  amount: number;
};

export type WeekRow = {
  key: WeekRowKey;
  value: number;
  decimals: 0 | 1;
  suffix: '' | '%' | ' h';
  /** Nulo quando a semana anterior não tem como comparar (sem jogo, ou sem o número). */
  delta: WeekDelta | null;
};

const HOUR = 3600;

const headshotPercent = (totals: WeekTotals): number | null =>
  totals.kills > 0 ? (totals.headshots / totals.kills) * 100 : null;

const round1 = (n: number) => Math.round(n * 10) / 10;

function percentDelta(current: number, previous: number | undefined): WeekDelta | null {
  if (previous === undefined || previous <= 0) return null;
  const amount = Math.round(((current - previous) / previous) * 100);
  return {
    kind: 'percent',
    direction: amount > 0 ? 'up' : amount < 0 ? 'down' : 'same',
    amount: Math.abs(amount),
  };
}

function pointsDelta(
  current: number | null,
  previous: number | null | undefined,
): WeekDelta | null {
  if (current === null || previous === null || previous === undefined) return null;
  const amount = round1(current - previous);
  return {
    kind: 'points',
    direction: amount > 0 ? 'up' : amount < 0 ? 'down' : 'same',
    amount: Math.abs(amount),
  };
}

export function weekRows(summary: WeekSummary): WeekRow[] {
  const { current, previous } = summary;
  const hours = current.secondsPlayed / HOUR;
  const hs = headshotPercent(current);
  return [
    {
      key: 'players',
      value: current.players,
      decimals: 0,
      suffix: '',
      delta: percentDelta(current.players, previous?.players),
    },
    {
      key: 'kills',
      value: current.kills,
      decimals: 0,
      suffix: '',
      delta: percentDelta(current.kills, previous?.kills),
    },
    {
      key: 'headshotPercent',
      value: hs === null ? 0 : round1(hs),
      decimals: 1,
      suffix: '%',
      delta: pointsDelta(hs, previous ? headshotPercent(previous) : null),
    },
    {
      key: 'hours',
      value: hours >= 10 ? Math.round(hours) : round1(hours),
      decimals: hours >= 10 ? 0 : 1,
      suffix: ' h',
      delta: percentDelta(current.secondsPlayed, previous?.secondsPlayed),
    },
  ];
}

const DAY_MS = 24 * HOUR * 1000;
const BRASILIA_OFFSET_MS = 3 * HOUR * 1000;

/** O instante em que a semana que começa em `weekStart` (segunda-feira, `YYYY-MM-DD`) começa, em Brasília (UTC−3). */
function weekStartInstant(weekStart: string): number {
  return Date.parse(`${weekStart}T00:00:00Z`) + BRASILIA_OFFSET_MS;
}

/** Quanto da semana já passou, de 0 a 1 (a barra da faixa). */
export function weekProgress(weekStart: string, now = Date.now()): number {
  const elapsed = (now - weekStartInstant(weekStart)) / (7 * DAY_MS);
  return Math.min(1, Math.max(0, elapsed));
}

/** A virada da semana (segunda-feira, 00:00 de Brasília) que fecha a que começou em `weekStart`. */
export function weekTurnAt(weekStart: string): number {
  return weekStartInstant(weekStart) + 7 * DAY_MS;
}

/** "19 de out. a 25 de out." (a semana inteira, em pt-BR). */
export function weekRange(weekStart: string, weekEnd: string): string {
  const format = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const day = (iso: string) => format.format(new Date(`${iso}T12:00:00Z`));
  return `${day(weekStart)} a ${day(weekEnd)}`;
}
