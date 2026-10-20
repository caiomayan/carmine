import { eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { discordLinks } from '../database/schema.js';
import type { DiscordUser } from './discord-client.js';

export type DiscordLink = typeof discordLinks.$inferSelect;

/** O Discord já está ligado a outra Conta do Carmine. */
export class DiscordAlreadyLinked extends Error {
  constructor() {
    super('esse Discord já está ligado a outra Conta');
    this.name = 'DiscordAlreadyLinked';
  }
}

/** A Conta já tem outro Discord ligado: é preciso desvincular antes. */
export class AccountAlreadyLinked extends Error {
  constructor() {
    super('a Conta já tem outro Discord ligado');
    this.name = 'AccountAlreadyLinked';
  }
}

/** Os vínculos Conta ↔ Discord (S15). Um Discord só liga a uma Conta; uma Conta, a um Discord. */
export class DiscordLinks {
  constructor(private readonly db: Database) {}

  async of(accountId: string): Promise<DiscordLink | null> {
    const [row] = await this.db
      .select()
      .from(discordLinks)
      .where(eq(discordLinks.accountId, accountId));
    return row ?? null;
  }

  async all(): Promise<DiscordLink[]> {
    return this.db.select().from(discordLinks);
  }

  /**
   * Liga o Discord à Conta. Repetir o mesmo par é inofensivo (atualiza o nome); o Discord de outra
   * Conta e outro Discord na mesma Conta são recusados.
   */
  async link(accountId: string, user: DiscordUser, now = new Date()): Promise<DiscordLink> {
    const [created] = await this.db
      .insert(discordLinks)
      .values({ accountId, discordId: user.id, username: user.username, linkedAt: now })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    const [byDiscord] = await this.db
      .select()
      .from(discordLinks)
      .where(eq(discordLinks.discordId, user.id));
    if (byDiscord?.accountId === accountId) {
      const [renamed] = await this.db
        .update(discordLinks)
        .set({ username: user.username })
        .where(eq(discordLinks.accountId, accountId))
        .returning();
      return renamed ?? byDiscord;
    }
    throw byDiscord ? new DiscordAlreadyLinked() : new AccountAlreadyLinked();
  }

  /** Desfaz o vínculo; devolve o que havia (nulo: a Conta não estava ligada). */
  async remove(accountId: string): Promise<DiscordLink | null> {
    const [removed] = await this.db
      .delete(discordLinks)
      .where(eq(discordLinks.accountId, accountId))
      .returning();
    return removed ?? null;
  }

  /** Guarda o que a reconciliação deixou aplicado. */
  async markSynced(accountId: string, roles: readonly string[], now: Date): Promise<void> {
    await this.db
      .update(discordLinks)
      .set({ syncedRoles: [...roles], syncedAt: now, retryAt: null })
      .where(eq(discordLinks.accountId, accountId));
  }

  /** Adia a próxima tentativa (a pessoa saiu do servidor, ou o Discord falhou). */
  async retryAfter(accountId: string, at: Date): Promise<void> {
    await this.db
      .update(discordLinks)
      .set({ retryAt: at })
      .where(eq(discordLinks.accountId, accountId));
  }
}
