import { and, count, eq, gte, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { avatarReports, reports } from '../database/schema.js';

/** O banco ou uma transação dele. */
type Executor = Pick<Database, 'select' | 'execute'>;

/**
 * Trava o denunciante até o fim da transação: sem isto, duas Denúncias ao mesmo tempo (de jogo e de foto) leriam a
 * mesma contagem e passariam juntas do teto. A chave é a mesma para todos os tipos de Denúncia.
 */
export async function lockReporter(tx: Executor, reporterId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${reporterId}, 13))`);
}

/**
 * Quantas Denúncias aceitas a Conta fez desde `since`, somando todos os tipos (regra única de denúncia, ADR 0026):
 * é a conta do teto por dia. A Denúncia descartada porque a imagem já foi aprovada não grava nada, então não conta.
 */
export async function countReportsSince(
  tx: Executor,
  reporterId: string,
  since: Date,
): Promise<number> {
  const [game] = await tx
    .select({ total: count() })
    .from(reports)
    .where(and(eq(reports.reporterAccountId, reporterId), gte(reports.createdAt, since)));
  const [avatar] = await tx
    .select({ total: count() })
    .from(avatarReports)
    .where(
      and(eq(avatarReports.reporterAccountId, reporterId), gte(avatarReports.createdAt, since)),
    );
  return (game?.total ?? 0) + (avatar?.total ?? 0);
}
