import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { reports } from '../database/schema.js';

/** O banco ou uma transação dele. */
type Executor = Pick<Database, 'update'>;

/**
 * Em SQL: o Mapa jogado de uma Denúncia, para agrupar (regra única de denúncia, ADR 0026). É o `map_play_id` quando o
 * plugin o mandou; sem ele, o servidor e o nome do mapa. `alias` é o nome da tabela `reports` na consulta de quem chama.
 */
export const reportMapPlay = (alias: string) =>
  sql.raw(
    `coalesce(${alias}.map_play_id::text, coalesce(${alias}.server_id::text, '') || '|' || coalesce(${alias}.map, ''))`,
  );

/**
 * Fecha o caso da Denúncia: ela e todas as abertas contra a mesma Conta, pelo mesmo motivo, no mesmo Mapa jogado
 * (arquivar ou punir uma resolve todas). Uma instrução só, então vale para as que entraram até este instante.
 * Devolve os IDs fechados.
 */
export async function resolveReportCase(
  tx: Executor,
  reportId: string,
  resolution: {
    status: 'archived' | 'sanctioned';
    at: Date;
    bySteamId: bigint;
    reason: string | null;
  },
): Promise<string[]> {
  const closed = await tx
    .update(reports)
    .set({
      status: resolution.status,
      resolvedAt: resolution.at,
      resolvedBySteamId: resolution.bySteamId,
      resolutionReason: resolution.reason,
    })
    .where(
      and(
        eq(reports.status, 'open'),
        sql`(reports.target_account_id, reports.reason, ${reportMapPlay('reports')}) = (
          select c.target_account_id, c.reason, ${reportMapPlay('c')} from reports c where c.id = ${reportId}
        )`,
      ),
    )
    .returning({ id: reports.id });
  return closed.map((row) => row.id);
}
