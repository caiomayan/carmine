import { RATING_MODES, RATING_WINDOW_DAYS } from '@carmine/contracts';
import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { ratingPopulation } from '../database/schema.js';
import {
  buildSidePopulation,
  RATING_FORMULA_VERSION,
  type RatingPopulation,
  type RatingSide,
  type SidePopulation,
} from './rating.js';
import { dayBefore, loadRatingCounts, windowEndingAt } from './rating-counts.js';
import { dayOf, weekStartOf } from './stats-week.js';

const SIDES: readonly RatingSide[] = ['ct', 't'];

type PopulationRow = typeof ratingPopulation.$inferSelect;

/** A linha do banco como a população que a calculadora usa. */
export function rowToPopulation(row: PopulationRow): SidePopulation {
  return {
    accounts: row.accounts,
    mean: {
      kills: row.meanKills,
      survival: row.meanSurvival,
      kast: row.meanKast,
      damage: row.meanDamage,
      impact: row.meanImpact,
    },
    sd: {
      kills: row.sdKills,
      survival: row.sdSurvival,
      kast: row.sdKast,
      damage: row.sdDamage,
      impact: row.sdImpact,
    },
  };
}

/**
 * A população do Rating (S21, ADR 0029): a média e o desvio de cada parte, por Modo e lado, nos
 * últimos 90 dias. É calculada **uma vez por semana** (a primeira rodada depois que a semana de
 * Brasília começa) e vale a semana inteira, então o Rating de uma Conta não se mexe só porque outra
 * jogou. Um Modo e lado com menos de 20 Contas elegíveis não ganha linha, e o job tenta de novo na
 * rodada seguinte até haver. A janela termina no dia anterior ao do cálculo.
 */
export class RatingPopulations {
  private readonly logger = new Logger(RatingPopulations.name);

  constructor(private readonly db: Database) {}

  /** Calcula o que falta da semana de `now`; devolve quantos Modos e lados ganharam linha. */
  async ensureWeek(now = new Date()): Promise<number> {
    const weekStart = weekStartOf(now);
    const window = windowEndingAt(dayBefore(dayOf(now)), RATING_WINDOW_DAYS);
    let written = 0;
    for (const mode of RATING_MODES) {
      const have = await this.db
        .select({ side: ratingPopulation.side })
        .from(ratingPopulation)
        .where(
          and(
            eq(ratingPopulation.version, RATING_FORMULA_VERSION),
            eq(ratingPopulation.weekStart, weekStart),
            eq(ratingPopulation.mode, mode),
          ),
        );
      const missing = SIDES.filter((side) => !have.some((row) => row.side === side));
      if (missing.length === 0) continue;

      const rows = await loadRatingCounts(this.db, { mode, window });
      for (const side of missing) {
        const population = buildSidePopulation(
          rows.filter((row) => row.side === side).map((row) => row.counts),
        );
        if (population === null) continue;
        await this.db
          .insert(ratingPopulation)
          .values({
            version: RATING_FORMULA_VERSION,
            weekStart,
            mode,
            side,
            accounts: population.accounts,
            windowFrom: window.from,
            windowTo: window.to,
            meanKills: population.mean.kills,
            meanSurvival: population.mean.survival,
            meanKast: population.mean.kast,
            meanDamage: population.mean.damage,
            meanImpact: population.mean.impact,
            sdKills: population.sd.kills,
            sdSurvival: population.sd.survival,
            sdKast: population.sd.kast,
            sdDamage: population.sd.damage,
            sdImpact: population.sd.impact,
          })
          .onConflictDoNothing();
        written++;
      }
    }
    if (written > 0)
      this.logger.log(`População do Rating da semana ${weekStart}: ${written} lado(s)`);
    return written;
  }

  /** A população mais recente da versão atual no Modo; um lado sem linha é `null`. */
  async latest(mode: (typeof RATING_MODES)[number]): Promise<RatingPopulation> {
    const result: RatingPopulation = { ct: null, t: null };
    const { rows } = await this.db.execute<{ week_start: string }>(sql`
      select max(week_start)::text as week_start from rating_population
      where version = ${RATING_FORMULA_VERSION} and mode = ${mode}`);
    const week = rows[0]?.week_start;
    if (!week) return result;
    const stored = await this.db
      .select()
      .from(ratingPopulation)
      .where(
        and(
          eq(ratingPopulation.version, RATING_FORMULA_VERSION),
          eq(ratingPopulation.weekStart, week),
          eq(ratingPopulation.mode, mode),
        ),
      );
    for (const row of stored) result[row.side] = rowToPopulation(row);
    return result;
  }
}

/** Roda a {@link RatingPopulations} ao subir e depois no intervalo; `intervalMs` 0 desliga. Nunca rejeita. */
export class RatingPopulationsJob implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RatingPopulationsJob.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly populations: Pick<RatingPopulations, 'ensureWeek'>,
    private readonly intervalMs: number,
  ) {}

  onModuleInit(): void {
    if (this.intervalMs <= 0) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async run(): Promise<void> {
    try {
      await this.populations.ensureWeek();
    } catch (error) {
      this.logger.warn(`População do Rating falhou: ${(error as Error).message}`);
    }
  }
}
