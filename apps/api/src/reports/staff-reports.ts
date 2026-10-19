import {
  REPORT_REASONS_NEEDING_EVIDENCE,
  type ReportReason,
  type ReportStatus,
  STAFF_REPORTS_PAGE_DEFAULT,
  type StaffReport,
  type StaffReportPage,
} from '@carmine/contracts';
import { aliasedTable, and, asc, desc, eq, gt, lt, or, type SQL, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, gameServers, reports } from '../database/schema.js';
import { recordStaffAudit, type StaffAction } from '../staff/audit-log.js';

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

/**
 * A fila de Denúncias da Staff (S13): lista com o contexto (chat do momento, servidor, round) e
 * arquivamento com motivo, sempre no log de auditoria. Virar Punição passa por `Sanctions.apply`
 * (com `reportId`), o mesmo fluxo de qualquer Punição.
 */
export class StaffReports {
  constructor(private readonly db: Database) {}

  async page(
    status: ReportStatus,
    options: { before?: string; limit?: number } = {},
  ): Promise<StaffReportPage> {
    const limit = options.limit ?? STAFF_REPORTS_PAGE_DEFAULT;
    // A fila aberta anda das mais antigas (o prazo de 72 h corre), o histórico das mais novas.
    const oldestFirst = status === 'open';
    const conditions: SQL[] = [eq(reports.status, status)];
    if (options.before) {
      const { at, id } = decodeCursor(options.before);
      const compare = oldestFirst ? gt : lt;
      conditions.push(
        or(
          compare(reports.createdAt, at),
          and(eq(reports.createdAt, at), compare(reports.id, id)),
        ) as SQL,
      );
    }
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
        otherOpen: sql<number>`(
          select count(*)::int from reports as other
          where other.target_account_id = ${reports.targetAccountId}
            and other.status = 'open' and other.id <> ${reports.id}
        )`,
      })
      .from(reports)
      // leftJoin: o innerJoin seguido de outro join na mesma tabela quebra a inferência de tipos do drizzle.
      .leftJoin(target, eq(target.id, reports.targetAccountId))
      .leftJoin(reporter, eq(reporter.id, reports.reporterAccountId))
      .leftJoin(gameServers, eq(gameServers.id, reports.serverId))
      .leftJoin(resolver, eq(resolver.steamId, reports.resolvedBySteamId))
      .where(and(...conditions))
      .orderBy(
        oldestFirst ? asc(reports.createdAt) : desc(reports.createdAt),
        oldestFirst ? asc(reports.id) : desc(reports.id),
      )
      .limit(limit + 1);

    const [counted] = await this.db
      .select({ openCount: sql<number>`count(*)::int` })
      .from(reports)
      .where(eq(reports.status, 'open'));

    const items = rows.slice(0, limit).map(
      (row): StaffReport => ({
        id: row.report.id,
        status: row.report.status,
        reason: row.report.reason,
        createdAt: row.report.createdAt.toISOString(),
        // A FK garante a Conta; o leftJoin só nulifica o tipo.
        target: { publicId: row.targetPublicId ?? 0, displayName: row.targetName ?? '' },
        reporter:
          row.reporterPublicId === null || row.reporterName === null
            ? null
            : { publicId: row.reporterPublicId, displayName: row.reporterName },
        server:
          row.report.serverId === null
            ? null
            : {
                id: row.report.serverId,
                name: row.serverName ?? '(removido)',
                code: row.serverCode,
                mode: row.serverMode ?? 'retake',
              },
        map: row.report.map,
        round: row.report.round,
        chat: row.report.chatContext,
        otherOpenAgainstTarget: row.otherOpen,
        needsEvidence: REPORT_REASONS_NEEDING_EVIDENCE.includes(row.report.reason),
        resolution:
          row.report.resolvedAt === null
            ? null
            : {
                at: row.report.resolvedAt.toISOString(),
                by: { publicId: row.resolverPublicId, displayName: row.resolverName },
                reason: row.report.resolutionReason,
              },
      }),
    );
    const last = rows.length > limit ? rows[limit - 1]?.report : undefined;
    return {
      reports: items,
      nextCursor: last ? encodeCursor(last.createdAt, last.id) : null,
      openCount: counted?.openCount ?? 0,
    };
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

  /** Arquiva a Denúncia aberta, com o motivo da Staff, e registra no log de auditoria. */
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
      await tx
        .update(reports)
        .set({
          status: 'archived',
          resolvedAt: now,
          resolvedBySteamId: BigInt(staff.actorSteamId),
          resolutionReason: staff.reason,
        })
        .where(eq(reports.id, reportId));
      await recordStaffAudit(tx, {
        action: 'report_archive',
        staff,
        target: { accountId: row.targetAccountId, steamId: row.targetSteamId },
        details: { reportId, reportReason: row.reason },
        at: now,
      });
    });
  }
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } {
  const [iso = '', id = ''] = Buffer.from(cursor, 'base64url').toString().split('|');
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/.test(id)) {
    throw new InvalidReportCursor('cursor inválido');
  }
  return { at, id };
}
