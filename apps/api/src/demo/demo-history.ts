import type { GameMode } from '@carmine/contracts';
import { weekStartOf } from '../stats/stats-week.js';
import { DEMO_SERVERS, type DemoPlayer } from './demo-cast.js';
import { between, type Random, seeded } from './demo-random.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Segunda-feira 00:00 de Brasília (-03:00 fixo) em UTC. */
const BRASILIA_SHIFT_MS = 3 * 60 * 60 * 1000;

/** Quantas semanas (a atual e as anteriores) a demonstração tem de histórico. */
export const DEMO_WEEKS = 4;

export interface DemoWeekStats {
  mode: GameMode;
  weekStart: string;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  damage: number;
  roundsPlayed: number;
  roundsWon: number;
  secondsPlayed: number;
}

/** As segundas-feiras das últimas `DEMO_WEEKS` semanas, da atual para trás. */
export function demoWeeks(now: Date): string[] {
  const current = Date.parse(`${weekStartOf(now)}T00:00:00Z`);
  return Array.from({ length: DEMO_WEEKS }, (_, back) =>
    new Date(current - back * 7 * DAY_MS).toISOString().slice(0, 10),
  );
}

/** O quanto da semana atual já passou, de 0 a 1. */
export function currentWeekFraction(now: Date): number {
  const start = Date.parse(`${weekStartOf(now)}T00:00:00Z`) + BRASILIA_SHIFT_MS;
  return Math.min(Math.max((now.getTime() - start) / (7 * DAY_MS), 0), 1);
}

/**
 * As Estatísticas de uma semana de um jogador fictício, a partir de uma semente fixa (jogador e
 * semana): o mesmo deploy gera sempre os mesmos números. `weekFraction` é o quanto da semana já
 * passou (na semana atual); nunca abaixo de 0,4, para o Ranking não nascer vazio na segunda-feira.
 * Dá `null` quando o jogador não jogou naquela semana.
 */
export function weekStatsOf(
  player: DemoPlayer,
  weekStart: string,
  weekFraction: number,
  isCurrentWeek: boolean,
): DemoWeekStats | null {
  const mode = DEMO_SERVERS.find((server) => server.name === player.home)?.mode ?? 'retake';
  const random = seeded(`semana:${player.steamId}:${weekStart}`);
  if (!isCurrentWeek && random() < 0.15) return null;
  const effort = between(random, 0.4, 1.15) * Math.max(weekFraction, 0.4);
  return mode === 'retake'
    ? retakeWeek(weekStart, player.skill, effort, random)
    : deathmatchWeek(weekStart, player.skill, effort, random);
}

function retakeWeek(
  weekStart: string,
  skill: number,
  effort: number,
  random: Random,
): DemoWeekStats {
  const roundsPlayed = Math.round(380 * effort);
  const kills = Math.round(roundsPlayed * 0.62 * skill * between(random, 0.9, 1.1));
  return {
    mode: 'retake',
    weekStart,
    kills,
    deaths: Math.round(roundsPlayed * 0.64 * between(random, 0.85, 1.15)),
    assists: Math.round(kills * 0.26 * between(random, 0.8, 1.2)),
    headshots: Math.round(kills * (0.3 + 0.18 * (skill - 0.7)) * between(random, 0.9, 1.1)),
    damage: Math.round(roundsPlayed * 58 * skill * between(random, 0.92, 1.08)),
    roundsPlayed,
    roundsWon: Math.round(roundsPlayed * between(random, 0.45, 0.62)),
    secondsPlayed: roundsPlayed * 55,
  };
}

function deathmatchWeek(
  weekStart: string,
  skill: number,
  effort: number,
  random: Random,
): DemoWeekStats {
  const secondsPlayed = Math.round(10_800 * effort);
  const kills = Math.round((secondsPlayed / 60) * 1.05 * skill * between(random, 0.9, 1.1));
  return {
    mode: 'deathmatch',
    weekStart,
    kills,
    deaths: Math.round(kills / between(random, 0.85, 1.55)),
    assists: Math.round(kills * 0.08),
    headshots: Math.round(kills * between(random, 0.28, 0.46)),
    damage: kills * 96,
    roundsPlayed: 0,
    roundsWon: 0,
    secondsPlayed,
  };
}

/**
 * As Estatísticas do dono por semana. Retake forte e sempre acima do mínimo do Ranking (50 rounds);
 * Deathmatch poucos minutos, abaixo do mínimo (30 min) nas duas semanas mais recentes, para a tela de
 * "faltam X minutos" também ter o que mostrar.
 */
export function ownerWeekStats(
  weekStart: string,
  back: number,
  weekFraction: number,
): DemoWeekStats[] {
  const fraction = back === 0 ? Math.max(weekFraction, 0.4) : 1;
  const retake = retakeWeek(
    weekStart,
    1.18,
    0.55 * fraction + 0.1 * (3 - back),
    seeded(`dono:${weekStart}`),
  );
  const minutes = back < 2 ? 18 : 95;
  const dm = deathmatchWeek(
    weekStart,
    1.1,
    (minutes * 60) / 10_800,
    seeded(`dono-dm:${weekStart}`),
  );
  return [retake, dm];
}
