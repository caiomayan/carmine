import type { GameMode, ModeStats, TotalStats } from '@carmine/contracts';

/** Contagens de uma Conta num Modo (ou somadas), como estão no banco. */
export interface StatsTotals {
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damage: number;
  roundsPlayed: number;
  roundsWon: number;
  secondsPlayed: number;
}

/** Arredonda para `places` casas (as definições da S12 fixam as casas de cada número). */
function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function toTotalStats(totals: StatsTotals): TotalStats {
  return {
    kills: totals.kills,
    deaths: totals.deaths,
    assists: totals.assists,
    kd: round(totals.kills / Math.max(totals.deaths, 1), 2),
    headshotPercent: totals.kills === 0 ? null : round((totals.headshots / totals.kills) * 100, 1),
    secondsPlayed: totals.secondsPlayed,
  };
}

/** ADR só existe no Retake e KPM só no Deathmatch; no outro Modo são nulos. */
export function toModeStats(mode: GameMode, totals: StatsTotals): ModeStats {
  const adr =
    mode === 'retake' && totals.roundsPlayed > 0
      ? round(totals.damage / totals.roundsPlayed, 1)
      : null;
  const kpm =
    mode === 'deathmatch' && totals.secondsPlayed > 0
      ? round(totals.kills / (totals.secondsPlayed / 60), 2)
      : null;
  return { mode, ...toTotalStats(totals), adr, kpm };
}
