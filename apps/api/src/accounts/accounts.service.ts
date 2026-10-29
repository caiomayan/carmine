import { randomInt } from 'node:crypto';
import type { PlayerConnect, PlayerConnectResult } from '@carmine/contracts';
import { and, eq, gt, isNull, lte, or, type SQL, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, publicIdCounter, sanctions } from '../database/schema.js';
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
  /** Nome Steam cujo Nome de exibição a Staff resetou (S07); nulo sem reset. */
  displayNameBlockedSteamName: string | null;
  /** Nome de exibição próprio (S11); nulo: vale o nome Steam. */
  customDisplayName: string | null;
  /** Última troca do nome próprio (ou reset da Staff que o apagou); base do prazo de 7 dias. */
  displayNameChangedAt: Date | null;
  /** Perfil privado (S11): sem Estatísticas e anônima no Ranking. */
  profilePrivate: boolean;
  /** O avatar efetivo (Steam ou foto própria no ar, ADR 0022). Nulo: vale o avatar neutro. */
  avatarUrl: string | null;
  avatarFetchedAt: Date | null;
  /** O avatar da Steam, sempre guardado para a volta. Nulo: a Steam ainda não respondeu. */
  steamAvatarUrl: string | null;
  avatarSource: 'steam' | 'custom';
  /** Envio de foto bloqueado até aqui (reincidente); só a Staff vê. */
  avatarUploadBlockedUntil: Date | null;
  /** Nulo: Conta não reivindicada. */
  claimedAt: Date | null;
  firstConnectedAt: Date | null;
  lastConnectedAt: Date | null;
  /** `!chat off`: não vê o chat dos outros no jogo. */
  chatHidden: boolean;
  /** Quando a Conta entrou na fila da AWP do Retake (S16); nulo: ainda não. */
  awpDefaultAppliedAt: Date | null;
  /** A última curiosidade mostrada no connect (S16). */
  lastCuriosity: string | null;
  /** Anonimizada por um pedido de exclusão de dados (S08); nulo: Conta normal. */
  anonymizedAt: Date | null;
  createdAt: Date;
}

/** O connect registrado: a Conta e o que o plugin aplica (sem Punições e VIP, que o controller junta). */
export type ConnectedAccount = Pick<
  PlayerConnectResult,
  'publicId' | 'displayName' | 'isFirstConnect' | 'chatHidden' | 'applyAwpDefault'
> & {
  accountId: string;
  /** A Conta nasceu neste connect (o analytics mede `conta_criada`). */
  created: boolean;
  /** A Conta já entrou no site alguma vez. */
  claimed: boolean;
  /** Quando o connect aconteceu (o horário do plugin, se válido): o do fato, não o do envio. */
  connectedAt: Date;
};

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
  async registerConnect(connect: PlayerConnect): Promise<ConnectedAccount> {
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
        const { account, isFirstConnect, created } = result;
        return {
          accountId: account.id,
          publicId: account.publicId,
          displayName: account.displayName,
          isFirstConnect,
          chatHidden: account.chatHidden,
          applyAwpDefault: account.awpDefaultAppliedAt === null,
          created,
          claimed: account.claimedAt !== null,
          connectedAt,
        };
      }
    }
    throw new Error(`Conflito persistente ao criar a Conta de ${connect.steamId}`);
  }

  /**
   * Login Steam no site (S03): o primeiro reivindica a Conta. Se a pessoa nunca jogou, a Conta
   * nasce já reivindicada, com nome e avatar da Steam Web API (sem resposta, um nome fictício fixo e o
   * avatar neutro até o próximo login ou connect). É sempre a mesma Conta do SteamID: nunca há
   * fusão. `firstLogin` diz se foi este login que reivindicou a Conta; sob logins simultâneos,
   * só um deles.
   */
  async claimOnLogin(
    steamId: string,
  ): Promise<{ account: Account; firstLogin: boolean; created: boolean }> {
    const known = await this.findBySteamId(steamId);
    const summary =
      known && known.anonymizedAt === null ? null : await this.avatars.lookup(steamId);
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

  /**
   * Grava o `!chat off` (`hidden`) ou `!chat on` do jogador, vindo do Carmine.Core. `false` se a
   * Conta não existe (ou foi anonimizada).
   */
  async setChatHidden(steamId: string, hidden: boolean): Promise<boolean> {
    const updated = await this.db
      .update(accounts)
      .set({ chatHidden: hidden })
      .where(and(eq(accounts.steamId, BigInt(steamId)), isNull(accounts.anonymizedAt)))
      .returning({ id: accounts.id });
    return updated.length > 0;
  }

  /**
   * Marca que a Conta passou pela AWP por padrão do Retake (S16). Idempotente: a primeira marca fica.
   * `false` se a Conta não existe (ou foi anonimizada).
   */
  async markAwpDefaultApplied(steamId: string): Promise<boolean> {
    const updated = await this.db
      .update(accounts)
      .set({ awpDefaultAppliedAt: sql`coalesce(${accounts.awpDefaultAppliedAt}, now())` })
      .where(and(eq(accounts.steamId, BigInt(steamId)), isNull(accounts.anonymizedAt)))
      .returning({ id: accounts.id });
    return updated.length > 0;
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

  /** Liga ou desliga o Perfil privado (S11). `false` se a Conta não existe ou foi anonimizada. */
  async setProfilePrivate(accountId: string, isPrivate: boolean): Promise<boolean> {
    const updated = await this.db
      .update(accounts)
      .set({ profilePrivate: isPrivate })
      .where(and(eq(accounts.id, accountId), isNull(accounts.anonymizedAt)))
      .returning({ id: accounts.id });
    return updated.length > 0;
  }

  /** `null` quando outro connect do mesmo jogador criou a Conta no meio do caminho. */
  private async upsertOnConnect(
    tx: Transaction,
    connect: PlayerConnect,
    connectedAt: Date,
  ): Promise<{ account: Account; isFirstConnect: boolean; created: boolean } | null> {
    const steamId = BigInt(connect.steamId);
    const [found] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.steamId, steamId))
      .for('update');
    const existing = found && (await keepUnlessReleased(tx, found, connectedAt));

    if (existing?.anonymizedAt) {
      // Anonimizada com um ban valendo: o ban continua, mas o nome não volta.
      return { account: toAccount(existing), isFirstConnect: false, created: false };
    }
    if (existing) {
      const [updated] = await tx
        .update(accounts)
        .set({
          steamName: connect.steamName,
          displayName: displayNameFor(
            connect.steamName,
            existing.publicId,
            existing.displayNameBlockedSteamName,
            existing.customDisplayName,
          ),
          firstConnectedAt: sql`coalesce(${accounts.firstConnectedAt}, ${connectedAt})`,
          lastConnectedAt: sql`greatest(${accounts.lastConnectedAt}, ${connectedAt})`,
        })
        .where(eq(accounts.id, existing.id))
        .returning();
      return {
        account: toAccount(updated as AccountRow),
        isFirstConnect: existing.firstConnectedAt === null,
        created: false,
      };
    }

    const created = await insertAccount(tx, steamId, connect.steamName, {
      firstConnectedAt: connectedAt,
      lastConnectedAt: connectedAt,
    });
    return created ? { account: created, isFirstConnect: true, created: true } : null;
  }

  /** `null` quando um connect do mesmo jogador criou a Conta no meio do caminho. */
  private async claimInTransaction(
    tx: Transaction,
    steamId: bigint,
    summary: SteamSummary | null,
    now: Date,
  ): Promise<{ account: Account; firstLogin: boolean; created: boolean } | null> {
    const [found] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.steamId, steamId))
      .for('update');
    const existing = found && (await keepUnlessReleased(tx, found, now));
    if (existing) {
      // Anonimizada com um ban valendo: entra só para ver o ban, sem reivindicar nada de novo.
      if (existing.claimedAt !== null || existing.anonymizedAt !== null) {
        return { account: toAccount(existing), firstLogin: false, created: false };
      }
      const [claimed] = await tx
        .update(accounts)
        .set({ claimedAt: now })
        .where(eq(accounts.id, existing.id))
        .returning();
      return { account: toAccount(claimed as AccountRow), firstLogin: true, created: false };
    }
    const created = await insertAccount(tx, steamId, summary?.personaName ?? '', {
      claimedAt: now,
      avatarUrl: summary?.avatarUrl ?? null,
      avatarFetchedAt: summary ? now : null,
      steamAvatarUrl: summary?.avatarUrl ?? null,
    });
    return created ? { account: created, firstLogin: true, created: true } : null;
  }
}

/**
 * Uma Conta anonimizada (S08) só guarda o SteamID64 enquanto um ban dela vale. Quando a pessoa
 * volta e o ban já acabou, o vínculo é desfeito aqui (`steamId = -publicId`) e ela segue como
 * quem nunca jogou (`null`): ganha uma Conta nova. Fora isso, devolve a própria linha.
 */
export async function keepUnlessReleased(
  tx: Transaction,
  row: AccountRow,
  now: Date,
): Promise<AccountRow | null> {
  if (row.anonymizedAt === null) return row;
  const [ban] = await tx
    .select({ id: sanctions.id })
    .from(sanctions)
    .where(and(eq(sanctions.accountId, row.id), activeBanAt(now)))
    .limit(1);
  if (ban) return row;
  await tx
    .update(accounts)
    .set({ steamId: detachedSteamId(row.publicId) })
    .where(eq(accounts.id, row.id));
  return null;
}

/** SteamID "desligado" de uma Conta anonimizada: negativo, nunca colide com um de verdade. */
export function detachedSteamId(publicId: number): bigint {
  return -BigInt(publicId);
}

/** Ban não revogado, já começado e não vencido em `now`. */
export function activeBanAt(now: Date): SQL {
  return and(
    eq(sanctions.type, 'ban'),
    isNull(sanctions.revokedAt),
    lte(sanctions.startsAt, now),
    or(isNull(sanctions.endsAt), gt(sanctions.endsAt, now)),
  ) as SQL;
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

/**
 * Garante a Conta de cada SteamID64 humano que chegou em eventos do jogo sem Conta (o connect não
 * foi registrado, a API estava fora...): quem joga num Servidor Carmine já é uma Conta, não
 * reivindicada, e tudo dele conta como o de qualquer outra. Cria pelo mesmo caminho do connect
 * (`insertAccount`, com o ID público novo e o nome fictício, porque o evento não traz nome Steam) e
 * na transação de quem chamou. Devolve só as Contas criadas agora (SteamID64 → ID da Conta); as que
 * outra transação criou no meio do caminho são relidas, e esta não as devolve como criadas.
 */
export async function createUnclaimedAccounts(
  tx: Transaction,
  steamIds: readonly string[],
): Promise<{ created: Map<string, string>; existing: Map<string, string> }> {
  const created = new Map<string, string>();
  const existing = new Map<string, string>();
  // Ordem fixa, para dois lotes com os mesmos jogadores novos não se travarem um no outro.
  for (const steamId of [...steamIds].sort()) {
    const account = await insertAccount(tx, BigInt(steamId), '', {});
    if (account) {
      created.set(steamId, account.id);
      continue;
    }
    const [found] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.steamId, BigInt(steamId)));
    if (found) existing.set(steamId, found.id);
  }
  return { created, existing };
}

/** Próximo `n` da sequência do Postgres: único mesmo entre transações simultâneas. */
async function nextCounter(tx: Transaction): Promise<number> {
  const result = await tx.execute<{ n: string }>(
    sql`select nextval(${publicIdCounter.seqName}) as n`,
  );
  return Number(result.rows[0]?.n);
}
