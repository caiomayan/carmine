import {
  REPORT_REVIEW_DEADLINE_HOURS,
  REPORTER_ARCHIVED_MIN,
  REPORTER_WINDOW_DAYS,
  type ReportKind,
} from '@carmine/contracts';
import { type SQL, sql } from 'drizzle-orm';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** O início da janela em que as Denúncias de quem denuncia contam para o peso. */
export function weightWindowStart(now: Date): Date {
  return new Date(now.getTime() - REPORTER_WINDOW_DAYS * DAY_MS);
}

/**
 * Em SQL: a Conta `reporter` perdeu peso como denunciante? Perde quem tem pelo menos `REPORTER_ARCHIVED_MIN`
 * Denúncias arquivadas pela Staff, sem Punição, desde `since`, e mais arquivadas do que confirmadas. Vale para todos
 * os tipos de uma vez (regra única de denúncia, ADR 0027): na Denúncia de jogo, arquivada é `archived` e confirmada é
 * `sanctioned`; na de foto, arquivada é a mantida (`dismissed_at`) e confirmada é a foto removida.
 *
 * `reporter` é a expressão da Conta de fora (uma coluna da consulta de quem chama), escrita por extenso, com o nome da
 * tabela: numa seleção de uma tabela só, o drizzle tira o prefixo das colunas interpoladas dentro de `sql`, e a
 * subconsulta passaria a comparar com as colunas dela mesma. Os apelidos `g`, `x`, `p` e `t` são das subconsultas.
 * Sem Conta (denunciante excluído), não perde peso.
 */
export function reporterLowWeight(reporter: SQL, since: Date): SQL<boolean> {
  return sql<boolean>`coalesce((
    select sum(t.kept) >= ${REPORTER_ARCHIVED_MIN} and sum(t.kept) > sum(t.confirmed)
    from (
      select (g.status = 'archived')::int as kept, (g.status = 'sanctioned')::int as confirmed
      from reports g
      where g.reporter_account_id = ${reporter} and g.created_at > ${since.toISOString()}::timestamptz
      union all
      select (x.dismissed_at is not null)::int, (x.dismissed_at is null and p.status = 'removed')::int
      from avatar_reports x join account_avatars p on p.id = x.avatar_id
      where x.reporter_account_id = ${reporter} and x.created_at > ${since.toISOString()}::timestamptz
    ) t
  ), false)`;
}

/**
 * O prazo da Staff de um caso aberto: o instante da Denúncia mais antiga de quem tem peso normal mais o prazo do
 * tipo. Nulo quando não há Denúncia assim (todas são de quem perdeu peso): sem prazo correndo.
 */
export function reviewDeadline(kind: ReportKind, firstNormalAt: Date | null): Date | null {
  return firstNormalAt
    ? new Date(firstNormalAt.getTime() + REPORT_REVIEW_DEADLINE_HOURS[kind] * HOUR_MS)
    : null;
}
