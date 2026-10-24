import {
  type GameMode,
  PROFILE_SERIES_WEEKS,
  type ProfileSeries,
  type WeekStats,
} from '@carmine/contracts';
import { type StatsTotals, toTotalStats } from './stats-formulas.js';

const MODES: GameMode[] = ['retake', 'deathmatch'];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Uma linha de `account_stats_weekly`: as contagens de uma Conta num Modo numa semana. */
export interface WeeklyRow extends StatsTotals {
  mode: GameMode;
  weekStart: string;
}

const EMPTY: StatsTotals = {
  kills: 0,
  deaths: 0,
  assists: 0,
  headshots: 0,
  damage: 0,
  roundsPlayed: 0,
  roundsWon: 0,
  secondsPlayed: 0,
};

function add(a: StatsTotals, b: StatsTotals): StatsTotals {
  return {
    kills: a.kills + b.kills,
    deaths: a.deaths + b.deaths,
    assists: a.assists + b.assists,
    headshots: a.headshots + b.headshots,
    damage: a.damage + b.damage,
    roundsPlayed: a.roundsPlayed + b.roundsPlayed,
    roundsWon: a.roundsWon + b.roundsWon,
    secondsPlayed: a.secondsPlayed + b.secondsPlayed,
  };
}

/** O que a série mostra de uma semana: K/D e HS% saem das mesmas contas das Estatísticas. */
function weekCounts(totals: StatsTotals) {
  const { kills, deaths, kd, headshotPercent, secondsPlayed } = toTotalStats(totals);
  return { rounds: totals.roundsPlayed, kills, deaths, kd, headshotPercent, secondsPlayed };
}

/** As `count` segundas-feiras terminando em `lastWeek`, da mais antiga à atual. */
export function seriesWeeks(lastWeek: string, count = PROFILE_SERIES_WEEKS): string[] {
  const last = Date.parse(`${lastWeek}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    new Date(last - (count - 1 - index) * WEEK_MS).toISOString().slice(0, 10),
  );
}

/**
 * A série semanal do Perfil a partir das linhas do agregado semanal, sem inventar nada: semana
 * sem linha vem com zeros (e HS% nulo), e só existe o que o agregado guarda (nada por dia nem
 * por arma). `currentWeek` é a segunda-feira da semana de hoje em Brasília.
 */
export function buildSeries(
  rows: readonly WeeklyRow[],
  currentWeek: string,
): Omit<ProfileSeries, 'visible'> {
  const totalsOf = (matching: (row: WeeklyRow) => boolean) =>
    rows.filter(matching).reduce<StatsTotals>(add, EMPTY);

  const weeks: WeekStats[] = seriesWeeks(currentWeek).map((weekStart) => ({
    weekStart,
    ...weekCounts(totalsOf((row) => row.weekStart === weekStart)),
    modes: MODES.map((mode) => ({
      mode,
      ...weekCounts(totalsOf((row) => row.weekStart === weekStart && row.mode === mode)),
    })),
  }));

  const secondsByMode = (matching: (row: WeeklyRow) => boolean) =>
    MODES.map((mode) => ({
      mode,
      secondsPlayed: totalsOf((row) => row.mode === mode && matching(row)).secondsPlayed,
    }));

  const firstWeek = rows.reduce<string | null>(
    (first, row) => (first === null || row.weekStart < first ? row.weekStart : first),
    null,
  );

  return {
    weeks,
    hours: {
      week: secondsByMode((row) => row.weekStart === currentWeek),
      total: secondsByMode(() => true),
    },
    firstWeek,
  };
}
