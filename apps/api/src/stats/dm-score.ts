import {
  DM_SCORE_MEAN,
  DM_SCORE_MIN_POPULATION,
  DM_SCORE_PULL_MINUTES,
  DM_SCORE_SPREAD,
} from '@carmine/contracts';
import { DEATHMATCH_MIN_SECONDS } from './ranking.js';

/** As somas do Deathmatch de uma Conta numa janela (semana ou 90 dias), como estão no banco. */
export interface DmSums {
  kills: number;
  deaths: number;
  headshots: number;
  damage: number;
  secondsPlayed: number;
}

/** As quatro partes da Pontuação, numa Conta. */
export interface DmParts {
  killsPerMinute: number;
  kd: number;
  damagePerMinute: number;
  /** Em %; 0 sem kills (a parte não some, a Conta só não tem headshot). */
  headshotPercent: number;
}

export interface DmPart {
  mean: number;
  /** Desvio padrão da população (não da amostra: as Contas elegíveis são a população inteira). */
  sd: number;
}

/** Média e desvio de cada parte entre as Contas elegíveis do DM na janela. */
export interface DmPopulation {
  accounts: number;
  killsPerMinute: DmPart;
  kd: DmPart;
  damagePerMinute: DmPart;
  headshotPercent: DmPart;
}

const PART_KEYS = ['killsPerMinute', 'kd', 'damagePerMinute', 'headshotPercent'] as const;

/**
 * As quatro taxas de uma Conta; nulo sem tempo jogado. K/D é `kills ÷ max(mortes, 1)` (a definição da
 * S12), e o dano é o dano bruto do ADR 0018 (sem o corte pela vida da vítima).
 */
export function dmParts(sums: DmSums): DmParts | null {
  if (sums.secondsPlayed <= 0) return null;
  const minutes = sums.secondsPlayed / 60;
  return {
    killsPerMinute: sums.kills / minutes,
    kd: sums.kills / Math.max(sums.deaths, 1),
    damagePerMinute: sums.damage / minutes,
    headshotPercent: sums.kills === 0 ? 0 : (sums.headshots / sums.kills) * 100,
  };
}

/**
 * A Pontuação DM (S21, ADR 0030): a média dos quatro z-scores (peso igual) contra a população do DM,
 * em `100 + 15 · média`, puxada para 100 pela amostra (`minutos ÷ (minutos + 15)`), com 1 casa.
 *
 * Nulo, e nunca um número inventado, quando a Conta não tem o mínimo de minutos do Ranking do DM
 * nesta janela, quando não há população ou ela tem menos de {@link DM_SCORE_MIN_POPULATION} Contas.
 * Uma parte sem variação na população (desvio 0) vale 0 em z: não separa ninguém.
 */
export function dmScore(sums: DmSums, population: DmPopulation | null): number | null {
  if (sums.secondsPlayed < DEATHMATCH_MIN_SECONDS) return null;
  if (!population || population.accounts < DM_SCORE_MIN_POPULATION) return null;
  const parts = dmParts(sums);
  if (!parts) return null;
  const meanZ =
    PART_KEYS.reduce((total, key) => {
      const { mean, sd } = population[key];
      return total + (sd > 0 ? (parts[key] - mean) / sd : 0);
    }, 0) / PART_KEYS.length;
  const raw = DM_SCORE_MEAN + DM_SCORE_SPREAD * meanZ;
  const minutes = sums.secondsPlayed / 60;
  const pulled =
    DM_SCORE_MEAN + (raw - DM_SCORE_MEAN) * (minutes / (minutes + DM_SCORE_PULL_MINUTES));
  return Math.round(pulled * 10) / 10;
}
