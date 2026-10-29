import {
  DEATHMATCH_MIN_MINUTES,
  type GameMode,
  type RankingProgress,
  RETAKE_MIN_ROUNDS,
} from '@carmine/contracts';
import { type StatsTotals, toModeStats } from './stats-formulas.js';

export { RANKING_SIZE } from '@carmine/contracts';
export { RETAKE_MIN_ROUNDS };

export const DEATHMATCH_MIN_SECONDS = DEATHMATCH_MIN_MINUTES * 60;

/** A semana de uma Conta num Modo, como o Ranking lê (S12). */
export interface RankingRow extends StatsTotals {
  accountId: string;
  /** Desempate final: a Conta mais antiga (menor data de criação) fica na frente. */
  createdAt: Date;
  /** Fecha a ordem quando duas Contas têm o mesmo instante de criação (é único por Conta). */
  publicId: number;
}

/** Uma linha já ordenada, com a posição e os números que o Ranking mostra. */
export interface RankedRow {
  position: number;
  accountId: string;
  publicId: number;
  /** Retake: rounds vencidos. Deathmatch: KPM. */
  score: number;
  kd: number;
  headshotPercent: number | null;
  roundsPlayed: number;
  secondsPlayed: number;
}

/** Entrou no Ranking: cumpriu o mínimo da semana (rounds no Retake, tempo no Deathmatch). */
export function isEligible(mode: GameMode, row: StatsTotals): boolean {
  return mode === 'retake'
    ? row.roundsPlayed >= RETAKE_MIN_ROUNDS
    : row.secondsPlayed >= DEATHMATCH_MIN_SECONDS;
}

/**
 * Quanto falta para o mínimo da semana; nulo se já cumpriu. Sem linha na semana (`null`), falta o
 * mínimo inteiro. No Deathmatch os minutos sobem para o inteiro seguinte.
 */
export function progressToMinimum(mode: GameMode, row: StatsTotals | null): RankingProgress | null {
  if (mode === 'retake') {
    const missing = RETAKE_MIN_ROUNDS - (row?.roundsPlayed ?? 0);
    return missing > 0 ? { unit: 'rounds', missing } : null;
  }
  const missing = Math.ceil((DEATHMATCH_MIN_SECONDS - (row?.secondsPlayed ?? 0)) / 60);
  return missing > 0 ? { unit: 'minutes', missing } : null;
}

/**
 * Ordena a semana de um Modo (S12, ADR 0018): só quem cumpriu o mínimo entra.
 *
 * - Retake: rounds vencidos, depois K/D.
 * - Deathmatch: KPM, depois HS%.
 * - Se ainda empatar: mais kills, e por fim a Conta mais antiga (menor data de criação, e o menor
 *   ID público se o instante for o mesmo). O ID público sozinho não serve: o reservado (1 a 9.999)
 *   é dado pela Staff a uma Conta que pode ter nascido depois. O último critério é único por Conta,
 *   então a ordem é total e o mesmo conjunto dá sempre o mesmo Ranking, em qualquer ordem de entrada.
 *
 * Os números comparados são os mesmos que o Ranking mostra (K/D e KPM com 2 casas, HS% com 1):
 * quem aparece empatado na tela é desempatado pelo critério seguinte, nunca por uma casa oculta.
 * Devolve todas as elegíveis; quem corta no top 50 é o chamador.
 */
export function rankWeek(mode: GameMode, rows: readonly RankingRow[]): RankedRow[] {
  const rated = rows
    .filter((row) => isEligible(mode, row))
    .map((row) => {
      const stats = toModeStats(mode, row);
      return {
        accountId: row.accountId,
        publicId: row.publicId,
        createdAt: row.createdAt,
        kills: row.kills,
        score: mode === 'retake' ? row.roundsWon : (stats.kpm ?? 0),
        kd: stats.kd,
        headshotPercent: stats.headshotPercent,
        roundsPlayed: row.roundsPlayed,
        secondsPlayed: row.secondsPlayed,
      };
    });
  rated.sort(
    (a, b) =>
      b.score - a.score ||
      (mode === 'retake' ? b.kd - a.kd : (b.headshotPercent ?? 0) - (a.headshotPercent ?? 0)) ||
      b.kills - a.kills ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.publicId - b.publicId,
  );
  return rated.map(({ kills: _kills, createdAt: _createdAt, ...rest }, index) => ({
    position: index + 1,
    ...rest,
  }));
}
