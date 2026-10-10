import { randomInt } from 'node:crypto';
import type { PlayerConnect, PlayerConnectResult } from '@carmine/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, publicIdCounter } from '../database/schema.js';
import type { AvatarRefresher } from './avatar-refresher.js';
import { displayNameFor } from './display-name.js';
import { allocatePublicId, type BlockDraw } from './public-id.js';

/** Conta (`Account`) como o resto da API a vê. */
export interface Account {
  id: string;
  steamId: string;
  publicId: number;
  steamName: string;
  displayName: string;
  /** Nulo: ainda sem avatar Steam; vale o avatar neutro. */
  avatarUrl: string | null;
  avatarFetchedAt: Date | null;
  /** Nulo: Conta não reivindicada. */
  claimedAt: Date | null;
  firstConnectedAt: Date | null;
  lastConnectedAt: Date | null;
  createdAt: Date;
}

type AccountRow = typeof accounts.$inferSelect;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const toAccount = (row: AccountRow): Account => ({ ...row, steamId: row.steamId.toString() });

/** Contas: nascem no primeiro connect a um Servidor Carmine (ADR 0007). */
export class AccountsService {
  constructor(
    private readonly db: Database,
    private readonly avatars: AvatarRefresher,
  ) {}

  /**
   * Registra o connect de um jogador: cria a Conta se ela não existe, atualiza o nome Steam e
   * devolve o que o plugin aplica no jogo. Seguro sob connects simultâneos, inclusive do mesmo
   * jogador (só um deles recebe `isFirstConnect`).
   */
  async registerConnect(connect: PlayerConnect): Promise<PlayerConnectResult> {
    const now = new Date();
    // Um connect reenviado pelo plugin traz o horário original; nunca aceitamos um futuro.
    const connectedAt =
      connect.connectedAt && new Date(connect.connectedAt) < now
        ? new Date(connect.connectedAt)
        : now;

    // Na segunda volta, a Conta criada pelo connect concorrente já está visível.
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await this.db.transaction((tx) =>
        this.upsertOnConnect(tx, connect, connectedAt),
      );
      if (result) {
        this.avatars.refreshInBackground(result.account);
        const { account, isFirstConnect } = result;
        return { publicId: account.publicId, displayName: account.displayName, isFirstConnect };
      }
    }
    throw new Error(`Conflito persistente ao criar a Conta de ${connect.steamId}`);
  }

  async findBySteamId(steamId: string): Promise<Account | null> {
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.steamId, BigInt(steamId)));
    return row ? toAccount(row) : null;
  }

  /** `null` quando outro connect do mesmo jogador criou a Conta no meio do caminho. */
  private async upsertOnConnect(
    tx: Transaction,
    connect: PlayerConnect,
    connectedAt: Date,
  ): Promise<{ account: Account; isFirstConnect: boolean } | null> {
    const steamId = BigInt(connect.steamId);
    const [existing] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.steamId, steamId))
      .for('update');

    if (existing) {
      const [updated] = await tx
        .update(accounts)
        .set({
          steamName: connect.steamName,
          displayName: displayNameFor(connect.steamName, existing.publicId),
          firstConnectedAt: sql`coalesce(${accounts.firstConnectedAt}, ${connectedAt})`,
          lastConnectedAt: sql`greatest(${accounts.lastConnectedAt}, ${connectedAt})`,
        })
        .where(eq(accounts.id, existing.id))
        .returning();
      return {
        account: toAccount(updated as AccountRow),
        isFirstConnect: existing.firstConnectedAt === null,
      };
    }

    const publicId = await allocatePublicId(
      () => nextCounter(tx),
      () => randomInt(3) as BlockDraw,
    );
    const [created] = await tx
      .insert(accounts)
      .values({
        steamId,
        publicId,
        steamName: connect.steamName,
        displayName: displayNameFor(connect.steamName, publicId),
        firstConnectedAt: connectedAt,
        lastConnectedAt: connectedAt,
      })
      .onConflictDoNothing({ target: accounts.steamId })
      .returning();
    return created ? { account: toAccount(created), isFirstConnect: true } : null;
  }
}

/** Próximo `n` da sequência do Postgres: único mesmo entre transações simultâneas. */
async function nextCounter(tx: Transaction): Promise<number> {
  const result = await tx.execute<{ n: string }>(
    sql`select nextval(${publicIdCounter.seqName}) as n`,
  );
  return Number(result.rows[0]?.n);
}
