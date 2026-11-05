import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import {
  accountRatingDaily,
  accountStatsWeekly,
  accounts,
  ratingPopulation,
} from '../../src/database/schema.js';
import { RATING_FORMULA_VERSION, type RatingCounts } from '../../src/stats/rating.js';
import { dayOf, weekStartOf } from '../../src/stats/stats-week.js';
import type { TestApp } from './app.js';

/** Helpers dos testes do P4 (S21, issue #239): semeiam o que o P3 grava, sem passar pela coleta. */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** O dia de Brasília e a semana de "hoje" (o arquivo de teste deve chamar `installStableClock`). */
export const today = () => dayOf(new Date());
export const thisWeek = () => weekStartOf(new Date());
/** Bem antes da janela de 90 dias: conta para o Calibrando, não para o Rating. */
export const oldDay = () => dayOf(new Date(Date.now() - 200 * DAY_MS));

export const zeroCounts: RatingCounts = {
  rounds: 0,
  kills: 0,
  survivedRounds: 0,
  kastRounds: 0,
  damage: 0,
  openingKills: 0,
  openingDeaths: 0,
  mk2: 0,
  mk3: 0,
  mk4: 0,
  mk5: 0,
  cw1: 0,
  cw2: 0,
  cw3: 0,
  cw4: 0,
  cw5: 0,
};

/** A planilha de conferência da fórmula v1 (ADR 0029). */
const sheet = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./rating-v1/${name}`, import.meta.url), 'utf8'));

export const sheetAccounts = (
  sheet('population.json') as {
    accounts: { id: string; lifetimeRounds: number; ct: RatingCounts; t: RatingCounts }[];
  }
).accounts;

type Parts = Record<'kills' | 'survival' | 'kast' | 'damage' | 'impact', number>;
export interface SidePopulation {
  accounts: number;
  mean: Parts;
  sd: Parts;
}
export type Population = Record<'ct' | 't', SidePopulation>;

export const sheetPopulation = (sheet('expected.json') as { population: Population }).population;

/** Uma população de média 0 e desvio 1 em todas as partes: o z de cada parte é a própria taxa por round. */
const unitSide: SidePopulation = {
  accounts: 30,
  mean: { kills: 0, survival: 0, kast: 0, damage: 0, impact: 0 },
  sd: { kills: 1, survival: 1, kast: 1, damage: 1, impact: 1 },
};
export const unitPopulation: Population = { ct: unitSide, t: unitSide };

/** Grava a população da semana atual (o que o `RatingPopulationsJob` do P3 grava), nos dois lados. */
export async function seedPopulation(
  t: TestApp,
  population: Population = sheetPopulation,
): Promise<void> {
  const to = dayOf(new Date(Date.now() - DAY_MS));
  const from = dayOf(new Date(Date.now() - 90 * DAY_MS));
  await t.postgres.db.insert(ratingPopulation).values(
    (['ct', 't'] as const).map((side) => ({
      version: RATING_FORMULA_VERSION,
      weekStart: thisWeek(),
      mode: 'retake' as const,
      side,
      accounts: population[side].accounts,
      windowFrom: from,
      windowTo: to,
      meanKills: population[side].mean.kills,
      meanSurvival: population[side].mean.survival,
      meanKast: population[side].mean.kast,
      meanDamage: population[side].mean.damage,
      meanImpact: population[side].mean.impact,
      sdKills: population[side].sd.kills,
      sdSurvival: population[side].sd.survival,
      sdKast: population[side].sd.kast,
      sdDamage: population[side].sd.damage,
      sdImpact: population[side].sd.impact,
    })),
  );
}

/**
 * O que a coleta deixaria de uma Conta no Retake: contagens por lado na janela (hoje), os rounds de
 * antes dela (para `lifetimeRounds` valer a vida toda) e a semana em `account_stats_weekly` (o Perfil e
 * o Ranking leem de lá).
 */
export async function seedRetakeAccount(
  t: TestApp,
  accountId: string,
  seed: {
    ct?: RatingCounts;
    t?: RatingCounts;
    lifetimeRounds: number;
    /** Padrão: os rounds do Rating. */
    weeklyRounds?: number;
    roundsWon?: number;
    weekStart?: string;
  },
): Promise<void> {
  const rows = (['ct', 't'] as const).flatMap((side) => {
    const counts = seed[side];
    return counts && counts.rounds > 0
      ? [
          {
            accountId,
            day: today(),
            mode: 'retake' as const,
            map: 'de_mirage',
            side,
            ...counts,
          },
        ]
      : [];
  });
  const inWindow = (seed.ct?.rounds ?? 0) + (seed.t?.rounds ?? 0);
  const extra = seed.lifetimeRounds - inWindow;
  if (extra > 0) {
    rows.push({
      accountId,
      day: oldDay(),
      mode: 'retake' as const,
      map: 'de_mirage',
      side: 'ct' as const,
      ...zeroCounts,
      rounds: extra,
    });
  }
  if (rows.length > 0) await t.postgres.db.insert(accountRatingDaily).values(rows);
  const roundsPlayed = seed.weeklyRounds ?? inWindow;
  await t.postgres.db.insert(accountStatsWeekly).values({
    accountId,
    mode: 'retake',
    weekStart: seed.weekStart ?? thisWeek(),
    kills: (seed.ct?.kills ?? 0) + (seed.t?.kills ?? 0),
    deaths: Math.floor(roundsPlayed / 2),
    assists: 0,
    headshots: 0,
    damage: (seed.ct?.damage ?? 0) + (seed.t?.damage ?? 0),
    roundsPlayed,
    roundsWon: seed.roundsWon ?? Math.floor(roundsPlayed / 2),
    secondsPlayed: roundsPlayed * 90,
  });
}

/** Fixa o instante de criação da Conta (o último desempate do Ranking é a Conta mais antiga). */
export async function setCreatedAt(t: TestApp, accountId: string, at: Date): Promise<void> {
  await t.postgres.db.update(accounts).set({ createdAt: at }).where(eq(accounts.id, accountId));
}
