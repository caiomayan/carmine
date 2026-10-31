import { DM_SCORE_WINDOW_DAYS } from '@carmine/contracts';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountStatsDaily } from '../database/schema.js';
import { type DmPopulation, type DmSums, dmScore } from './dm-score.js';
import { DEATHMATCH_MIN_SECONDS } from './ranking.js';
import { dayOf } from './stats-week.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** O primeiro dia da janela de 90 dias que termina em `end` (os dois dias entram). */
export function dmWindowStart(end: string): string {
  return new Date(Date.parse(`${end}T00:00:00Z`) - (DM_SCORE_WINDOW_DAYS - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

interface PopulationRow extends Record<string, unknown> {
  accounts: number;
  kpm_mean: number | null;
  kpm_sd: number | null;
  kd_mean: number | null;
  kd_sd: number | null;
  dpm_mean: number | null;
  dpm_sd: number | null;
  hs_mean: number | null;
  hs_sd: number | null;
}

/**
 * Lê a população do DM e a Pontuação de uma Conta nas somas diárias (ADR 0018), que valem por 400
 * dias. A população é a dos 90 dias que terminam em `end`: as Contas com o mesmo mínimo de minutos
 * do Ranking do DM (`DEATHMATCH_MIN_MINUTES`, 30) nessa janela, menos as anonimizadas. Média e
 * desvio saem de uma consulta só; o resultado fica `ttlMs` na memória por dia final, porque o Perfil
 * e o Ranking o pedem a cada visita e ele só se mexe com os lotes de eventos.
 */
export class DmScoreReader {
  private readonly memo = new Map<string, { at: number; value: DmPopulation | null }>();

  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
    private readonly ttlMs = 60_000,
  ) {}

  /** O último dia da janela: hoje, ou o fim da semana pedida se ela já passou. */
  windowEnd(weekEnd?: string): string {
    const today = dayOf(this.now());
    return weekEnd !== undefined && weekEnd < today ? weekEnd : today;
  }

  async population(end: string): Promise<DmPopulation | null> {
    const nowMs = this.now().getTime();
    const hit = this.memo.get(end);
    if (hit && nowMs - hit.at < this.ttlMs) return hit.value;
    const value = await this.readPopulation(end);
    if (this.memo.size >= 16) this.memo.clear();
    this.memo.set(end, { at: nowMs, value });
    return value;
  }

  /** A Pontuação dos 90 dias de uma Conta; nulo abaixo do mínimo ou sem população. */
  async forAccount(accountId: string): Promise<number | null> {
    const end = this.windowEnd();
    const [own] = await this.db
      .select({
        kills: sql<number>`coalesce(sum(${accountStatsDaily.kills}), 0)::float8`,
        deaths: sql<number>`coalesce(sum(${accountStatsDaily.deaths}), 0)::float8`,
        headshots: sql<number>`coalesce(sum(${accountStatsDaily.headshots}), 0)::float8`,
        damage: sql<number>`coalesce(sum(${accountStatsDaily.damage}), 0)::float8`,
        secondsPlayed: sql<number>`coalesce(sum(${accountStatsDaily.secondsPlayed}), 0)::float8`,
      })
      .from(accountStatsDaily)
      .where(
        and(
          eq(accountStatsDaily.accountId, accountId),
          eq(accountStatsDaily.mode, 'deathmatch'),
          gte(accountStatsDaily.day, dmWindowStart(end)),
          lte(accountStatsDaily.day, end),
        ),
      );
    if (!own || own.secondsPlayed < DEATHMATCH_MIN_SECONDS) return null;
    const sums: DmSums = own;
    return dmScore(sums, await this.population(end));
  }

  private async readPopulation(end: string): Promise<DmPopulation | null> {
    const { rows } = await this.db.execute<PopulationRow>(sql`
      with per_account as (
        select
          sum(d.kills)::float8 as kills,
          sum(d.deaths)::float8 as deaths,
          sum(d.headshots)::float8 as headshots,
          sum(d.damage)::float8 as damage,
          sum(d.seconds_played)::float8 as seconds
        from account_stats_daily d
        join accounts a on a.id = d.account_id
        where d.mode = 'deathmatch'
          and d.day between ${dmWindowStart(end)} and ${end}
          and a.anonymized_at is null
        group by d.account_id
        having sum(d.seconds_played) >= ${DEATHMATCH_MIN_SECONDS}
      ), parts as (
        select
          kills / (seconds / 60) as kpm,
          kills / greatest(deaths, 1) as kd,
          damage / (seconds / 60) as dpm,
          case when kills = 0 then 0 else headshots / kills * 100 end as hs
        from per_account
      )
      select
        count(*)::int as accounts,
        avg(kpm)::float8 as kpm_mean, stddev_pop(kpm)::float8 as kpm_sd,
        avg(kd)::float8 as kd_mean, stddev_pop(kd)::float8 as kd_sd,
        avg(dpm)::float8 as dpm_mean, stddev_pop(dpm)::float8 as dpm_sd,
        avg(hs)::float8 as hs_mean, stddev_pop(hs)::float8 as hs_sd
      from parts
    `);
    const row = rows[0];
    if (!row || row.accounts === 0) return null;
    const part = (mean: number | null, sd: number | null) => ({ mean: mean ?? 0, sd: sd ?? 0 });
    return {
      accounts: row.accounts,
      killsPerMinute: part(row.kpm_mean, row.kpm_sd),
      kd: part(row.kd_mean, row.kd_sd),
      damagePerMinute: part(row.dpm_mean, row.dpm_sd),
      headshotPercent: part(row.hs_mean, row.hs_sd),
    };
  }
}
