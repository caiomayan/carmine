import { randomInt } from 'node:crypto';
import type { PlayerConnect, PlayerConnectResult } from '@carmine/contracts';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, publicIdCounter } from '../database/schema.js';
import type { AvatarRefresher } from './avatar-refresher.js';
import { displayNameFor } from './display-name.js';
import { allocatePublicId, type BlockDraw } from './public-id.js';
import type { SteamSummary } from './steam-profiles.js';

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

  /**
   * Login Steam no site (S03): o primeiro reivindica a Conta. Se a pessoa nunca jogou, a Conta
   * nasce já reivindicada, com nome e avatar da Steam Web API (sem resposta, "Jogador #ID" e o
   * avatar neutro até o próximo login ou connect). É sempre a mesma Conta do SteamID: nunca há
   * fusão. `firstLogin` diz se foi este login que reivindicou a Conta; sob logins simultâneos,
   * só um deles.
   */
  async claimOnLogin(steamId: string): Promise<{ account: Account; firstLogin: boolean }> {
    const known = await this.findBySteamId(steamId);
    const summary = known ? null : await this.avatars.lookup(steamId);
    // Na segunda volta, a Conta criada por um connect concorrente já está visível.
    for (let attempt = 0; attempt < 2; attempt++) {
      const claim = await this.db.transaction((tx) =>
        this.claimInTransaction(tx, BigInt(steamId), summary, new Date()),
      );
      if (claim) {
        this.avatars.refreshInBackground(claim.account);
        return claim;
      }
    }
    throw new Error(`Conflito persistente ao reivindicar a Conta de ${steamId}`);
  }

  async findBySteamId(steamId: string): Promise<Account | null> {
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.steamId, BigInt(steamId)));
    return row ? toAccount(row) : null;
  }

  async findById(id: string): Promise<Account | null> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.id, id));
    return row ? toAccount(row) : null;
  }

  async findByPublicId(publicId: number): Promise<Account | null> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.publicId, publicId));
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

    const created = await insertAccount(tx, steamId, connect.steamName, {
      firstConnectedAt: connectedAt,
      lastConnectedAt: connectedAt,
    });
    return created ? { account: created, isFirstConnect: true } : null;
  }

  /** `null` quando um connect do mesmo jogador criou a Conta no meio do caminho. */
  private async claimInTransaction(
    tx: Transaction,
    steamId: bigint,
    summary: SteamSummary | null,
    now: Date,
  ): Promise<{ account: Account; firstLogin: boolean } | null> {
    const [existing] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.steamId, steamId))
      .for('update');
    if (existing) {
      if (existing.claimedAt !== null) {
        return { account: toAccount(existing), firstLogin: false };
      }
      const [claimed] = await tx
        .update(accounts)
        .set({ claimedAt: now })
        .where(eq(accounts.id, existing.id))
        .returning();
      return { account: toAccount(claimed as AccountRow), firstLogin: true };
    }
    const created = await insertAccount(tx, steamId, summary?.personaName ?? '', {
      claimedAt: now,
      avatarUrl: summary?.avatarUrl ?? null,
      avatarFetchedAt: summary ? now : null,
    });
    return created ? { account: created, firstLogin: true } : null;
  }
}

/**
 * Cria a Conta com um ID público novo (ADR 0013); `null` se outra transação criou a do mesmo
 * SteamID primeiro.
 */
async function insertAccount(
  tx: Transaction,
  steamId: bigint,
  steamName: string,
  fields: Partial<typeof accounts.$inferInsert>,
): Promise<Account | null> {
  const publicId = await allocatePublicId(
    () => nextCounter(tx),
    () => randomInt(3) as BlockDraw,
  );
  const [created] = await tx
    .insert(accounts)
    .values({
      ...fields,
      steamId,
      publicId,
      steamName,
      displayName: displayNameFor(steamName, publicId),
    })
    .onConflictDoNothing({ target: accounts.steamId })
    .returning();
  return created ? toAccount(created) : null;
}

/** Próximo `n` da sequência do Postgres: único mesmo entre transações simultâneas. */
async function nextCounter(tx: Transaction): Promise<number> {
  const result = await tx.execute<{ n: string }>(
    sql`select nextval(${publicIdCounter.seqName}) as n`,
  );
  return Number(result.rows[0]?.n);
}
