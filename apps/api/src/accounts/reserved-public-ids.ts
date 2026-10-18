import { asc, eq, isNull } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import type { Database } from '../database/database.js';
import { accountPublicIdHistory, accounts } from '../database/schema.js';
import { recordStaffAudit, type StaffAction } from '../staff/audit-log.js';
import { FIRST_AUTOMATIC_PUBLIC_ID } from './public-id.js';

/** O ID pedido não está entre 1 e 9.999, a faixa dos IDs reservados. */
export class PublicIdOutOfReservedRange extends Error {
  constructor() {
    super('o ID reservado precisa ser um inteiro de 1 a 9999');
  }
}

/** Outra Conta tem (ou já teve) esse ID. */
export class PublicIdTaken extends Error {
  constructor(publicId: number) {
    super(`o ID ${publicId} já pertence a outra Conta`);
  }
}

/** A Conta já tem ID reservado: ele é imutável (ADR 0013). */
export class AccountPublicIdAlreadyReserved extends Error {
  constructor(publicId: number) {
    super(`a Conta já tem o ID reservado ${publicId}, que é imutável`);
  }
}

/** Conta anonimizada (S08): o ID dela não é reaproveitado. */
export class ReservedIdForAnonymizedAccount extends Error {
  constructor() {
    super('a Conta foi anonimizada');
  }
}

export interface ReservedIdAssignment {
  previousPublicId: number;
  publicId: number;
}

const UNIQUE_VIOLATION = '23505';
const RESERVED_ID_COLUMN_CONSTRAINTS = new Set([
  'accounts_publicId_unique',
  'account_public_id_history_pkey',
]);

/**
 * ID reservado por reatribuição (S10, ADR 0013): a Staff troca o ID automático de uma Conta por
 * um ID reservado (1 a 9.999), uma única vez por Conta. O ID antigo vai para o histórico e
 * continua funcionando como link (o web responde 301 para o ID atual); nenhum ID do histórico é
 * reaproveitado. Vai para o log de auditoria, na mesma transação.
 */
export class ReservedPublicIds {
  constructor(private readonly db: Database) {}

  async assign(
    accountId: string,
    publicId: number,
    staff: StaffAction,
    now = new Date(),
  ): Promise<ReservedIdAssignment> {
    if (!Number.isInteger(publicId) || publicId < 1 || publicId >= FIRST_AUTOMATIC_PUBLIC_ID) {
      throw new PublicIdOutOfReservedRange();
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [account] = await tx
          .select()
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .for('update');
        if (!account) throw new Error(`Conta ${accountId} não existe`);
        if (account.anonymizedAt !== null) throw new ReservedIdForAnonymizedAccount();
        // IDs abaixo de 10.000 atribuídos à mão antes deste comando também já são reservados.
        if (account.publicIdReservedAt !== null || account.publicId < FIRST_AUTOMATIC_PUBLIC_ID) {
          throw new AccountPublicIdAlreadyReserved(account.publicId);
        }
        const [owner] = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.publicId, publicId));
        const [former] = await tx
          .select({ id: accountPublicIdHistory.publicId })
          .from(accountPublicIdHistory)
          .where(eq(accountPublicIdHistory.publicId, publicId));
        if (owner || former) throw new PublicIdTaken(publicId);

        await tx.insert(accountPublicIdHistory).values({
          publicId: account.publicId,
          accountId,
          replacedAt: now,
        });
        await tx
          .update(accounts)
          .set({ publicId, publicIdReservedAt: now })
          .where(eq(accounts.id, accountId));
        await recordStaffAudit(tx, {
          action: 'account_reserved_id',
          staff,
          target: { accountId, steamId: account.steamId },
          details: { from: account.publicId, to: publicId },
          at: now,
        });
        return { previousPublicId: account.publicId, publicId };
      });
    } catch (error) {
      // Duas trocas simultâneas para o mesmo ID: a segunda esbarra na unicidade.
      if (isReservedIdCollision(error)) throw new PublicIdTaken(publicId);
      throw error;
    }
  }

  /** IDs antigos de Contas que ganharam um ID reservado, com o ID atual de cada uma (sem as anonimizadas). */
  async redirects(): Promise<{ from: number; to: number }[]> {
    const rows = await this.db
      .select({ from: accountPublicIdHistory.publicId, to: accounts.publicId })
      .from(accountPublicIdHistory)
      .innerJoin(accounts, eq(accounts.id, accountPublicIdHistory.accountId))
      .where(isNull(accounts.anonymizedAt))
      .orderBy(asc(accountPublicIdHistory.publicId));
    return rows;
  }
}

function isReservedIdCollision(error: unknown): boolean {
  const cause =
    error instanceof Error && error.cause instanceof DatabaseError ? error.cause : error;
  return (
    cause instanceof DatabaseError &&
    cause.code === UNIQUE_VIOLATION &&
    RESERVED_ID_COLUMN_CONSTRAINTS.has(cause.constraint ?? '')
  );
}
