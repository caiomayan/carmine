import type {
  GameMode,
  ModeStats,
  ModeWeekStats,
  ProfileSeries,
  TotalStats,
  WeekStats,
} from '@carmine/contracts';

/**
 * O que o Perfil (V3) mostra das Estatísticas, montado a partir das somas (`/stats`) e da série
 * semanal (`/stats/weekly`). Nada é estimado: o que o agregado não guarda (por dia, por arma,
 * sessões) não existe aqui, e uma semana sem dado fica de fora das tendências em vez de virar zero.
 */
export type Period = 'week' | 'total';

export type NumberKey = 'kd' | 'kills' | 'headshotPercent' | 'hours';

export interface PeriodNumber {
  key: NumberKey;
  /** Nulo quando não há dado (HS% sem nenhum abate). */
  value: number | null;
  decimals: number;
  suffix: string;
  /** Tendência das últimas semanas; nulo quando há menos de duas semanas com dado. */
  trend: number[] | null;
}

export type RowKey =
  | 'rounds'
  | 'kills'
  | 'deaths'
  | 'assists'
  | 'kd'
  | 'headshotPercent'
  | 'adr'
  | 'kpm'
  | 'timePlayed';

export interface ModeRow {
  key: RowKey;
  /** `timePlayed` em segundos. Nulo quando não há dado. */
  value: number | null;
}

export interface ModeCard {
  mode: GameMode;
  rows: ModeRow[];
}

/** A semana teve alguma atividade (rounds, abates ou tempo jogado). */
export function hasActivity(week: Pick<WeekStats, 'rounds' | 'kills' | 'secondsPlayed'>): boolean {
  return week.rounds > 0 || week.kills > 0 || week.secondsPlayed > 0;
}

/** A semana atual da série (a última), ou nulo sem série. */
export function currentWeekOf(series: ProfileSeries | null): WeekStats | null {
  return series?.weeks.at(-1) ?? null;
}

/** A semana atual abre o Perfil quando tem atividade; senão, o total (zeros não dizem nada). */
export function defaultPeriod(series: ProfileSeries | null): Period {
  const current = currentWeekOf(series);
  return current !== null && hasActivity(current) ? 'week' : 'total';
}

const hours = (seconds: number) => seconds / 3600;

/** Uma tendência só existe com ao menos duas semanas com dado. */
function trendOf(values: (number | null)[]): number[] | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length >= 2 ? known : null;
}

/** Os quatro números grandes (K/D, abates, HS% e horas) do período, cada um com a sua tendência. */
export function numbersOf(
  period: Period,
  total: TotalStats,
  series: ProfileSeries | null,
): PeriodNumber[] {
  const weeks = series?.weeks ?? [];
  const active = weeks.filter(hasActivity);
  const current = currentWeekOf(series);
  const source =
    period === 'week' && current !== null
      ? {
          kd: current.kd,
          kills: current.kills,
          headshotPercent: current.headshotPercent,
          seconds: current.secondsPlayed,
        }
      : {
          kd: total.kd,
          kills: total.kills,
          headshotPercent: total.headshotPercent,
          seconds: total.secondsPlayed,
        };
  return [
    {
      key: 'kd',
      value: source.kd,
      decimals: 2,
      suffix: '',
      trend: trendOf(active.map((w) => w.kd)),
    },
    {
      key: 'kills',
      value: source.kills,
      decimals: 0,
      suffix: '',
      trend: trendOf(active.map((w) => w.kills)),
    },
    {
      key: 'headshotPercent',
      value: source.headshotPercent,
      decimals: 1,
      suffix: '%',
      trend: trendOf(active.map((w) => w.headshotPercent)),
    },
    {
      key: 'hours',
      value: hours(source.seconds),
      decimals: source.seconds >= 36_000 ? 0 : 1,
      suffix: ' h',
      trend: trendOf(active.map((w) => hours(w.secondsPlayed))),
    },
  ];
}

const row = (key: RowKey, value: number | null): ModeRow => ({ key, value });

function weekCard(week: ModeWeekStats): ModeCard {
  const rows = [
    ...(week.mode === 'retake' ? [row('rounds', week.rounds)] : []),
    row('kills', week.kills),
    row('kd', week.kd),
    row('headshotPercent', week.headshotPercent),
    row('timePlayed', week.secondsPlayed),
  ];
  return { mode: week.mode, rows };
}

function totalCard(stats: ModeStats): ModeCard {
  return {
    mode: stats.mode,
    rows: [
      row('kills', stats.kills),
      row('deaths', stats.deaths),
      row('assists', stats.assists),
      row('kd', stats.kd),
      row('headshotPercent', stats.headshotPercent),
      ...(stats.mode === 'retake' ? [row('adr', stats.adr)] : [row('kpm', stats.kpm)]),
      row('timePlayed', stats.secondsPlayed),
    ],
  };
}

/** Um cartão por Modo com atividade no período: o Modo parado não ganha cartão de zeros. */
export function modeCardsOf(
  period: Period,
  modes: ModeStats[],
  series: ProfileSeries | null,
): ModeCard[] {
  const current = currentWeekOf(series);
  if (period === 'week' && current !== null) {
    return current.modes.filter((mode) => hasActivity(mode)).map(weekCard);
  }
  return modes.map(totalCard);
}

/** Segundos por Modo (semana ou total) para o anel de horas; os Modos parados ficam de fora. */
export function hoursByMode(
  period: Period,
  series: ProfileSeries | null,
  modes: ModeStats[],
): { mode: GameMode; seconds: number }[] {
  const fromSeries = period === 'week' ? series?.hours?.week : series?.hours?.total;
  const entries =
    fromSeries ?? modes.map((mode) => ({ mode: mode.mode, secondsPlayed: mode.secondsPlayed }));
  return entries
    .filter((entry) => entry.secondsPlayed > 0)
    .map((entry) => ({ mode: entry.mode, seconds: entry.secondsPlayed }));
}

/** Os rounds jogados em cada uma das semanas da série, para o gráfico de área. */
export function roundsByWeek(
  series: ProfileSeries | null,
): { weekStart: string; rounds: number }[] {
  return (series?.weeks ?? []).map((week) => ({ weekStart: week.weekStart, rounds: week.rounds }));
}
