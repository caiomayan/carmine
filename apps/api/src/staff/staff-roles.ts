import { STAFF_ROLE_RANK, type StaffMember, type StaffRole } from '@carmine/contracts';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, staffMembers } from '../database/schema.js';
import { recordStaffAudit, type StaffAction } from './audit-log.js';

/** Papel de Staff só para Conta reivindicada: a Staff age pelo site. */
export class AccountNotClaimed extends Error {
  constructor() {
    super('a Conta ainda não fez login no site');
  }
}

/** Tirar (ou rebaixar) o último Dono deixaria a plataforma sem ninguém que altere papéis. */
export class LastOwner extends Error {
  constructor() {
    super('a plataforma precisa de ao menos um Dono');
  }
}

/** Papéis da Staff (S07): Dono, Admin e Moderador. Quem pode alterar é do painel e do CLI. */
export class StaffRoles {
  constructor(private readonly db: Database) {}

  async roleOf(accountId: string): Promise<StaffRole | null> {
    const [row] = await this.db
      .select({ role: staffMembers.role })
      .from(staffMembers)
      .where(eq(staffMembers.accountId, accountId));
    return row?.role ?? null;
  }

  async rolesOf(accountIds: string[]): Promise<Map<string, StaffRole>> {
    if (accountIds.length === 0) return new Map();
    const rows = await this.db
      .select({ accountId: staffMembers.accountId, role: staffMembers.role })
      .from(staffMembers)
      .where(inArray(staffMembers.accountId, accountIds));
    return new Map(rows.map((row) => [row.accountId, row.role]));
  }

  /**
   * Dá o papel à Conta (ou a tira da Staff com `null`), com auditoria. Mudar para o mesmo papel
   * não faz nada. Devolve o papel anterior.
   */
  async set(
    accountId: string,
    role: StaffRole | null,
    staff: StaffAction,
    now = new Date(),
  ): Promise<StaffRole | null> {
    return this.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ steamId: accounts.steamId, claimedAt: accounts.claimedAt })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!account) throw new Error(`Conta ${accountId} não existe`);
      // Trava os Donos: duas remoções simultâneas não deixam a plataforma sem nenhum.
      const owners = await tx
        .select({ accountId: staffMembers.accountId })
        .from(staffMembers)
        .where(eq(staffMembers.role, 'owner'))
        .for('update');
      const [current] = await tx
        .select({ role: staffMembers.role })
        .from(staffMembers)
        .where(eq(staffMembers.accountId, accountId));
      const before = current?.role ?? null;
      if (before === role) return before;
      if (role !== null && account.claimedAt === null) throw new AccountNotClaimed();
      if (before === 'owner' && owners.length <= 1) throw new LastOwner();

      if (role === null) {
        await tx.delete(staffMembers).where(eq(staffMembers.accountId, accountId));
      } else {
        await tx
          .insert(staffMembers)
          .values({ accountId, role, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({ target: staffMembers.accountId, set: { role, updatedAt: now } });
      }
      await recordStaffAudit(tx, {
        action: role === null ? 'role_revoke' : 'role_grant',
        staff,
        target: { accountId, steamId: account.steamId },
        details: { roleBefore: before, roleAfter: role },
        at: now,
      });
      return before;
    });
  }

  /** A Staff, do maior papel para o menor e por antiguidade. */
  async members(): Promise<StaffMember[]> {
    const rows = await this.db
      .select({ member: staffMembers, account: accounts })
      .from(staffMembers)
      .innerJoin(accounts, eq(accounts.id, staffMembers.accountId))
      .orderBy(asc(staffMembers.createdAt));
    return rows
      .map(({ member, account }) => ({
        publicId: account.publicId,
        steamId: account.steamId.toString(),
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        role: member.role,
        since: member.createdAt.toISOString(),
      }))
      .sort((a, b) => STAFF_ROLE_RANK[b.role] - STAFF_ROLE_RANK[a.role]);
  }
}
