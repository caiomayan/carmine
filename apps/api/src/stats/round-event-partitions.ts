import { ROUND_EVENT_RETENTION_MONTHS } from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';

/** Quantos meses à frente a limpeza mantém criados, para a escrita nunca esbarrar num mês sem partição. */
const MONTHS_AHEAD = 2;

export interface MonthKey {
  year: number;
  /** 1 a 12. */
  month: number;
}

/** O mês (UTC) de um instante: as partições de `round_events` são por mês UTC. */
export function monthOf(date: Date): MonthKey {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function addMonths({ year, month }: MonthKey, delta: number): MonthKey {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** O nome da partição de um mês, como a migração 0019 e `ensure` a criam. */
export function partitionName({ year, month }: MonthKey): string {
  return `round_events_y${year}m${String(month).padStart(2, '0')}`;
}

/** O mês de um nome de partição; nulo para o que não é uma partição mensal nossa. */
export function parsePartitionName(name: string): MonthKey | null {
  const match = /^round_events_y(\d{4})m(\d{2})$/.exec(name);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: Number(match[1]), month } : null;
}

/** O primeiro instante do mês (UTC). */
export function monthStart({ year, month }: MonthKey): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/**
 * Antes disto, um evento bruto já passou da retenção. É a mesma data de hoje, `months` meses atrás
 * (UTC), sem estourar o fim do mês: 31 de março menos 1 mês é 28 ou 29 de fevereiro.
 */
export function retentionCutoff(now: Date, months = ROUND_EVENT_RETENTION_MONTHS): Date {
  const target = addMonths(monthOf(now), -months);
  const lastDay = new Date(Date.UTC(target.year, target.month, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      target.year,
      target.month - 1,
      Math.min(now.getUTCDate(), lastDay),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

const literal = (date: Date) => `'${date.toISOString().replace('T', ' ').replace('Z', '+00')}'`;

/**
 * As partições mensais de `round_events` (S17, ADR 0024): cria o mês de um evento antes de ele ser
 * gravado e, no `RetentionJob`, mantém os próximos meses prontos e solta (`drop`) os que já passaram
 * dos 12 meses, o que é instantâneo e não deixa linhas mortas. Os nomes e os limites saem só de
 * números calculados aqui, nunca de texto de fora.
 */
export class RoundEventPartitions {
  private readonly logger = new Logger(RoundEventPartitions.name);
  private readonly ensured = new Set<string>();

  constructor(private readonly db: Database) {}

  /** Garante a partição de cada mês dos instantes dados (rápido: lembra o que já criou). */
  async ensureFor(dates: readonly Date[]): Promise<void> {
    const months = new Map<string, MonthKey>();
    for (const date of dates) {
      const key = monthOf(date);
      months.set(partitionName(key), key);
    }
    for (const [name, key] of months) {
      if (!this.ensured.has(name)) await this.create(name, key);
    }
  }

  /** O mês de `now` e os próximos, prontos. */
  async ensureAhead(now: Date): Promise<void> {
    const current = monthOf(now);
    await this.ensureFor(
      Array.from({ length: MONTHS_AHEAD + 1 }, (_, i) => monthStart(addMonths(current, i))),
    );
  }

  /** Solta as partições cujo mês inteiro é anterior ao corte da retenção. Devolve quantas. */
  async dropExpired(now: Date): Promise<number> {
    const cutoff = retentionCutoff(now);
    const { rows } = await this.db.execute<{ name: string }>(
      sql`select c.relname as name
          from pg_inherits i
          join pg_class c on c.oid = i.inhrelid
          join pg_class p on p.oid = i.inhparent
          where p.relname = 'round_events' and p.relnamespace = 'public'::regnamespace`,
    );
    let dropped = 0;
    for (const { name } of rows) {
      const key = parsePartitionName(name);
      if (!key || monthStart(addMonths(key, 1)) > cutoff) continue;
      await this.db.execute(sql.raw(`drop table if exists ${name}`));
      this.ensured.delete(name);
      dropped++;
    }
    if (dropped > 0) this.logger.log(`${dropped} partição(ões) de round_events solta(s)`);
    return dropped;
  }

  private async create(name: string, key: MonthKey): Promise<void> {
    const from = literal(monthStart(key));
    const to = literal(monthStart(addMonths(key, 1)));
    try {
      await this.db.execute(
        sql.raw(
          `create table if not exists ${name} partition of round_events for values from (${from}) to (${to})`,
        ),
      );
    } catch (error) {
      // Duas instâncias criando o mesmo mês ao mesmo tempo: quem perde só confere que ele existe.
      const { rows } = await this.db.execute(sql`select 1 from pg_class where relname = ${name}`);
      if (rows.length === 0) throw error;
    }
    this.ensured.add(name);
  }
}
