import {
  REPORT_REASONS_NEEDING_EVIDENCE,
  type ReportChatLine,
  type ReportReason,
  type ReportStatus,
  STAFF_REPORTS_PAGE_DEFAULT,
  type StaffReport,
  type StaffReportPage,
} from '@carmine/contracts';
import { aliasedTable, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, gameServers, reports } from '../database/schema.js';
import { recordStaffAudit, type StaffAction } from '../staff/audit-log.js';
import { reportMapPlay, resolveReportCase } from './report-cases.js';
import { reporterLowWeight, reviewDeadline, weightWindowStart } from './report-weight.js';

export class ReportNotFound extends Error {
  constructor() {
    super('Denúncia não encontrada');
  }
}

export class ReportNotOpen extends Error {
  constructor() {
    super('A Denúncia já foi arquivada ou virou Punição');
  }
}

/** A Denúncia é contra outra Conta. */
export class ReportTargetMismatch extends Error {
  constructor() {
    super('A Denúncia é contra outra Conta');
  }
}

/** O cursor não é desta fila (ou foi adulterado). */
export class InvalidReportCursor extends Error {}

const target = aliasedTable(accounts, 'target');
const reporter = aliasedTable(accounts, 'reporter');
const resolver = aliasedTable(accounts, 'resolver');

/** Um instante em texto, com microssegundos como o banco o guarda (um `Date` os perderia e repetiria o último caso). */
const KEY_FORMAT = `YYYY-MM-DD"T"HH24:MI:SS.US"Z"`;

interface CaseRow extends Record<string, unknown> {
  lead_id: string;
  member_ids: string[];
  grp: number;
  sort_key: string;
}

/**
 * A fila de Denúncias da Staff (S13): lista com o contexto (chat do momento, servidor, round) e
 * arquivamento com motivo, sempre no log de auditoria. Virar Punição passa por `Sanctions.apply`
 * (com `reportId`), o mesmo fluxo de qualquer Punição.
 *
 * A fila é de casos (regra única de denúncia, ADR 0026): as Denúncias contra a mesma Conta, pelo mesmo motivo, no
 * mesmo Mapa jogado viram um item, com a contagem e as provas juntas, e arquivar ou punir resolve todas. A fila aberta
 * anda das mais antigas (o prazo corre) e deixa no fim os casos só de quem perdeu peso como denunciante.
 */
export class StaffReports {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async page(
    status: ReportStatus,
    options: { before?: string; limit?: number } = {},
  ): Promise<StaffReportPage> {
    const limit = options.limit ?? STAFF_REPORTS_PAGE_DEFAULT;
    const open = status === 'open';
    const since = weightWindowStart(this.now());
    const low = open ? reporterLowWeight(sql.raw('r.reporter_account_id'), since) : sql`false`;
    const cursor = options.before ? decodeCursor(options.before, open) : null;

    // Na fila aberta o caso é ordenado pelo grupo (0 se alguma Denúncia aberta é de peso normal), pela mais antiga de
    // peso normal (a do prazo) e pelo ID; nas decididas, pelo instante da decisão, da mais recente.
    const sortAt = open
      ? sql`coalesce(min(created_at) filter (where not low), min(created_at))`
      : sql`max(resolved_at)`;
    const keyset = cursor
      ? open
        ? sql`where (grp, sort_at, lead_id::uuid) > (${cursor.group}::int, ${cursor.key}::timestamptz, ${cursor.id}::uuid)`
        : sql`where (sort_at, lead_id::uuid) < (${cursor.key}::timestamptz, ${cursor.id}::uuid)`
      : sql``;
    const order = open
      ? sql`order by grp, sort_at, lead_id::uuid`
      : sql`order by sort_at desc, lead_id::uuid desc`;

    const { rows: caseRows } = await this.db.execute<CaseRow>(sql`
      with base as (
        select r.id, r.target_account_id, r.reason, r.status, r.created_at, r.resolved_at,
          ${reportMapPlay('r')} as play, ${low} as low
        from reports r where r.status = ${status}
      ), cases as (
        select (array_agg(id::text order by created_at, id))[1] as lead_id,
          array_agg(id::text order by created_at, id) as member_ids,
          (case when ${sql.raw(String(open))} and bool_and(low) then 1 else 0 end) as grp,
          ${sortAt} as sort_at
        from base
        group by target_account_id, reason, play, resolved_at
      )
      select lead_id, member_ids, grp,
        to_char(sort_at at time zone 'UTC', ${KEY_FORMAT}) as sort_key
      from cases ${keyset} ${order} limit ${limit + 1}
    `);

    const pageRows = caseRows.slice(0, limit);
    const items = await this.casesOf(pageRows, since);
    const last = caseRows.length > limit ? pageRows[pageRows.length - 1] : undefined;

    const {
      rows: [counted],
    } = await this.db.execute<{ total: number }>(sql`
      select count(*)::int as total from (
        select 1 from reports r where r.status = 'open'
        group by r.target_account_id, r.reason, ${reportMapPlay('r')}
      ) c
    `);
    return {
      reports: items,
      nextCursor: last ? encodeCursor(last.grp, last.sort_key, last.lead_id) : null,
      openCount: counted?.total ?? 0,
    };
  }

  /** Monta os casos de uma página (as Denúncias de cada um, o contexto e as outras abertas contra o alvo). */
  private async casesOf(cases: CaseRow[], since: Date): Promise<StaffReport[]> {
    if (cases.length === 0) return [];
    const ids = cases.flatMap((row) => row.member_ids);
    const rows = await this.db
      .select({
        report: reports,
        targetPublicId: target.publicId,
        targetName: target.displayName,
        reporterPublicId: reporter.publicId,
        reporterName: reporter.displayName,
        serverName: gameServers.name,
        serverCode: gameServers.code,
        serverMode: gameServers.mode,
        resolverPublicId: resolver.publicId,
        resolverName: resolver.displayName,
        low: reporterLowWeight(sql.raw('"reports"."reporter_account_id"'), since),
      })
      .from(reports)
      // leftJoin: o innerJoin seguido de outro join na mesma tabela quebra a inferência de tipos do drizzle.
      .leftJoin(target, eq(target.id, reports.targetAccountId))
      .leftJoin(reporter, eq(reporter.id, reports.reporterAccountId))
      .leftJoin(gameServers, eq(gameServers.id, reports.serverId))
      .leftJoin(resolver, eq(resolver.steamId, reports.resolvedBySteamId))
      .where(inArray(reports.id, ids));
    const byId = new Map(rows.map((row) => [row.report.id, row]));

    const targetIds = [...new Set(rows.map((row) => row.report.targetAccountId))];
    const openByTarget = new Map<string, number>(
      (
        await this.db.execute<{ target: string; total: number }>(sql`
          select target_account_id as target, count(*)::int as total from reports
          where status = 'open' and target_account_id in (${sql.join(
            targetIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
          group by target_account_id
        `)
      ).rows.map((row) => [row.target, row.total]),
    );

    return cases.flatMap((entry): StaffReport[] => {
      const members = entry.member_ids.flatMap((id) => byId.get(id) ?? []);
      const lead = members[0];
      if (!lead) return [];
      const open = lead.report.status === 'open';
      const firstNormal = members.find((member) => !member.low);
      return [
        {
          id: lead.report.id,
          kind: 'game',
          status: lead.report.status,
          reason: lead.report.reason,
          createdAt: lead.report.createdAt.toISOString(),
          count: members.length,
          members: members.map((member) => ({
            id: member.report.id,
            createdAt: member.report.createdAt.toISOString(),
            reporter:
              member.reporterPublicId === null || member.reporterName === null
                ? null
                : { publicId: member.reporterPublicId, displayName: member.reporterName },
            round: member.report.round,
            lowWeight: open && member.low,
          })),
          deadlineAt: open
            ? (reviewDeadline('game', firstNormal?.report.createdAt ?? null)?.toISOString() ?? null)
            : null,
          lowWeight: open && !firstNormal,
          // A FK garante a Conta; o leftJoin só nulifica o tipo.
          target: { publicId: lead.targetPublicId ?? 0, displayName: lead.targetName ?? '' },
          reporter:
            lead.reporterPublicId === null || lead.reporterName === null
              ? null
              : { publicId: lead.reporterPublicId, displayName: lead.reporterName },
          server:
            lead.report.serverId === null
              ? null
              : {
                  id: lead.report.serverId,
                  name: lead.serverName ?? '(removido)',
                  code: lead.serverCode,
                  mode: lead.serverMode ?? 'retake',
                },
          map: lead.report.map,
          round: lead.report.round,
          chat: mergeChat(members.map((member) => member.report.chatContext)),
          otherOpenAgainstTarget: Math.max(
            0,
            (openByTarget.get(lead.report.targetAccountId) ?? 0) - (open ? members.length : 0),
          ),
          needsEvidence: REPORT_REASONS_NEEDING_EVIDENCE.includes(lead.report.reason),
          resolution:
            lead.report.resolvedAt === null
              ? null
              : {
                  at: lead.report.resolvedAt.toISOString(),
                  by: { publicId: lead.resolverPublicId, displayName: lead.resolverName },
                  reason: lead.report.resolutionReason,
                },
        },
      ];
    });
  }

  /**
   * Antes de aplicar uma Punição a partir de uma Denúncia: ela existe, está aberta e é contra
   * esta Conta. Devolve o motivo, para a regra de evidência.
   */
  async openReasonFor(reportId: string, targetAccountId: string): Promise<ReportReason> {
    const [row] = await this.db
      .select({
        status: reports.status,
        reason: reports.reason,
        targetAccountId: reports.targetAccountId,
      })
      .from(reports)
      .where(eq(reports.id, reportId));
    if (!row) throw new ReportNotFound();
    if (row.status !== 'open') throw new ReportNotOpen();
    if (row.targetAccountId !== targetAccountId) throw new ReportTargetMismatch();
    return row.reason;
  }

  /**
   * Arquiva o caso da Denúncia aberta (ela e as outras do mesmo caso), com o motivo da Staff, e registra no log de
   * auditoria uma vez, com os IDs de todas.
   */
  async archive(reportId: string, staff: StaffAction, now = new Date()): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          status: reports.status,
          reason: reports.reason,
          targetAccountId: reports.targetAccountId,
          targetSteamId: accounts.steamId,
        })
        .from(reports)
        .innerJoin(accounts, eq(accounts.id, reports.targetAccountId))
        .where(eq(reports.id, reportId))
        .for('update', { of: reports });
      if (!row) throw new ReportNotFound();
      if (row.status !== 'open') throw new ReportNotOpen();
      const closed = await resolveReportCase(tx, reportId, {
        status: 'archived',
        at: now,
        bySteamId: BigInt(staff.actorSteamId),
        reason: staff.reason,
      });
      await recordStaffAudit(tx, {
        action: 'report_archive',
        staff,
        target: { accountId: row.targetAccountId, steamId: row.targetSteamId },
        details: { reportId, reportReason: row.reason, reportIds: closed },
        at: now,
      });
    });
  }
}

/** As linhas de chat de várias Denúncias do mesmo caso, sem repetir a mesma linha, em ordem de horário. */
function mergeChat(contexts: readonly (readonly ReportChatLine[])[]): ReportChatLine[] {
  const seen = new Map<string, ReportChatLine>();
  for (const line of contexts.flat()) {
    const key = `${line.at}|${line.publicId ?? ''}|${line.text}`;
    if (!seen.has(key)) seen.set(key, line);
  }
  return [...seen.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** O cursor leva o grupo da fila, o instante com microssegundos e o ID do caso (o da Denúncia mais antiga). */
function encodeCursor(group: number, key: string, id: string): string {
  return Buffer.from(`${group}|${key}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string, open: boolean): { group: number; key: string; id: string } {
  const [group = '', key = '', id = ''] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (
    !(open ? /^[01]$/ : /^0$/).test(group) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(key) ||
    !/^[0-9a-f-]{36}$/.test(id)
  ) {
    throw new InvalidReportCursor('cursor inválido');
  }
  return { group: Number(group), key, id };
}
