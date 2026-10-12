import {
  STAFF_AUDIT_PAGE_DEFAULT,
  type StaffAuditAction,
  type StaffAuditEntry,
  type StaffAuditPage,
} from '@carmine/contracts';
import { aliasedTable, and, desc, eq, lt, or, type SQL } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, gameServers, staffAuditLog } from '../database/schema.js';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Quem da Staff fez e por quê: vai para o log de auditoria. */
export interface StaffAction {
  /** SteamID64 de quem fez. */
  actorSteamId: string;
  reason: string;
}

/** Uma ação da Staff a registrar. O alvo é uma Conta ou um Servidor Carmine. */
export interface StaffAuditRecord {
  action: StaffAuditAction;
  staff: StaffAction;
  target: { accountId: string; steamId: bigint | string } | { serverId: string };
  details: Record<string, unknown>;
  at: Date;
}

/**
 * Registra uma ação da Staff no log de auditoria (autor, ação, alvo, motivo, horário e o que
 * mudou). Chame dentro da transação da própria ação: ou as duas ficam, ou nenhuma.
 */
export async function recordStaffAudit(
  db: Database | Transaction,
  record: StaffAuditRecord,
): Promise<void> {
  const target =
    'serverId' in record.target
      ? { targetServerId: record.target.serverId }
      : {
          targetAccountId: record.target.accountId,
          targetSteamId: BigInt(record.target.steamId),
        };
  await db.insert(staffAuditLog).values({
    actorSteamId: BigInt(record.staff.actorSteamId),
    action: record.action,
    ...target,
    reason: record.staff.reason,
    details: record.details,
    createdAt: record.at,
  });
}

export interface StaffAuditFilter {
  /** SteamID64 de quem fez. */
  actorSteamId?: string;
  /** SteamID64 da Conta-alvo. */
  targetSteamId?: string;
  /** Id interno da Conta-alvo. */
  targetAccountId?: string;
  action?: StaffAuditAction;
  /** `nextCursor` da página anterior. */
  before?: string;
  limit?: number;
}

/** O cursor não é deste log (ou foi adulterado). */
export class InvalidAuditCursor extends Error {}

const actor = aliasedTable(accounts, 'actor');
const target = aliasedTable(accounts, 'target');

/** Leitura do log de auditoria da Staff, do mais recente para o mais antigo. */
export class StaffAuditLog {
  constructor(private readonly db: Database) {}

  async page(filter: StaffAuditFilter = {}): Promise<StaffAuditPage> {
    const limit = filter.limit ?? STAFF_AUDIT_PAGE_DEFAULT;
    const conditions: SQL[] = [];
    if (filter.actorSteamId) {
      conditions.push(eq(staffAuditLog.actorSteamId, BigInt(filter.actorSteamId)));
    }
    if (filter.targetSteamId) {
      conditions.push(eq(staffAuditLog.targetSteamId, BigInt(filter.targetSteamId)));
    }
    if (filter.targetAccountId) {
      conditions.push(eq(staffAuditLog.targetAccountId, filter.targetAccountId));
    }
    if (filter.action) conditions.push(eq(staffAuditLog.action, filter.action));
    if (filter.before) {
      const { at, id } = decodeCursor(filter.before);
      conditions.push(
        or(
          lt(staffAuditLog.createdAt, at),
          and(eq(staffAuditLog.createdAt, at), lt(staffAuditLog.id, id)),
        ) as SQL,
      );
    }
    const rows = await this.db
      .select({
        entry: staffAuditLog,
        actorPublicId: actor.publicId,
        actorName: actor.displayName,
        targetPublicId: target.publicId,
        targetName: target.displayName,
        serverName: gameServers.name,
      })
      .from(staffAuditLog)
      .leftJoin(actor, eq(actor.steamId, staffAuditLog.actorSteamId))
      .leftJoin(target, eq(target.id, staffAuditLog.targetAccountId))
      .leftJoin(gameServers, eq(gameServers.id, staffAuditLog.targetServerId))
      .where(and(...conditions))
      .orderBy(desc(staffAuditLog.createdAt), desc(staffAuditLog.id))
      .limit(limit + 1);
    const entries = rows.slice(0, limit).map(
      (row): StaffAuditEntry => ({
        id: row.entry.id,
        action: row.entry.action,
        actor: {
          steamId: row.entry.actorSteamId.toString(),
          publicId: row.actorPublicId,
          displayName: row.actorName,
        },
        targetAccount:
          row.entry.targetSteamId === null
            ? null
            : {
                steamId: row.entry.targetSteamId.toString(),
                publicId: row.targetPublicId,
                displayName: row.targetName,
              },
        targetServer:
          row.entry.targetServerId === null
            ? null
            : { id: row.entry.targetServerId, name: row.serverName ?? '(removido)' },
        reason: row.entry.reason,
        details: row.entry.details,
        createdAt: row.entry.createdAt.toISOString(),
      }),
    );
    const last = rows.length > limit ? rows[limit - 1]?.entry : undefined;
    return { entries, nextCursor: last ? encodeCursor(last.createdAt, last.id) : null };
  }
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } {
  const [iso = '', id = ''] = Buffer.from(cursor, 'base64url').toString().split('|');
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()) || !/^[0-9a-f-]{36}$/.test(id)) {
    throw new InvalidAuditCursor('cursor inválido');
  }
  return { at, id };
}
