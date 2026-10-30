import {
  GAME_PREFERENCE_DEFAULTS,
  GAME_PREFERENCE_MODES,
  type GameMode,
  type GamePreferenceKey,
  type GamePreferences,
  type GamePreferenceValue,
} from '@carmine/contracts';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountGamePreferences, accounts } from '../database/schema.js';

/** A chave não existe no Modo do servidor que pediu (por exemplo, `awp_raffle` num Deathmatch). */
export class PreferenceNotInMode extends Error {
  constructor(
    readonly key: GamePreferenceKey,
    readonly mode: GameMode,
  ) {
    super(`A preferência ${key} não vale no Modo ${mode}`);
  }
}

/**
 * As Preferências de jogo da Conta (ADR 0028): o que os plugins de jogo guardariam por servidor,
 * guardado aqui para valer em todo servidor do Modo. Quem decide o valor é a API; o Carmine.Core
 * aplica nos plugins.
 */
export class GamePreferencesStore {
  constructor(private readonly db: Database) {}

  /** As preferências da Conta, com o padrão no lugar do que ela nunca mudou. */
  async read(accountId: string, mode: GameMode): Promise<GamePreferences> {
    const rows = await this.db
      .select({ key: accountGamePreferences.key, value: accountGamePreferences.value })
      .from(accountGamePreferences)
      .where(
        and(eq(accountGamePreferences.accountId, accountId), eq(accountGamePreferences.mode, mode)),
      );
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    return { awpRaffle: booleanOf(stored.get('awp_raffle'), GAME_PREFERENCE_DEFAULTS.awp_raffle) };
  }

  /** Grava o valor explícito. `null` se a Conta não existe (ou foi anonimizada). */
  async set(
    steamId: string,
    mode: GameMode,
    key: GamePreferenceKey,
    enabled: boolean,
  ): Promise<GamePreferenceValue | null> {
    const accountId = await this.accountIdOf(steamId, mode, key);
    if (accountId === null) return null;
    await this.db
      .insert(accountGamePreferences)
      .values({ accountId, mode, key, value: enabled })
      .onConflictDoUpdate({
        target: [
          accountGamePreferences.accountId,
          accountGamePreferences.mode,
          accountGamePreferences.key,
        ],
        set: { value: enabled, updatedAt: sql`now()` },
      });
    return { key, enabled };
  }

  /**
   * Inverte o valor e devolve o novo, de uma vez só no banco (dois `!awp` seguidos nunca leem o mesmo
   * valor). A primeira inversão parte do padrão. `null` se a Conta não existe.
   */
  async toggle(
    steamId: string,
    mode: GameMode,
    key: GamePreferenceKey,
  ): Promise<GamePreferenceValue | null> {
    const accountId = await this.accountIdOf(steamId, mode, key);
    if (accountId === null) return null;
    const [row] = await this.db
      .insert(accountGamePreferences)
      .values({ accountId, mode, key, value: !GAME_PREFERENCE_DEFAULTS[key] })
      .onConflictDoUpdate({
        target: [
          accountGamePreferences.accountId,
          accountGamePreferences.mode,
          accountGamePreferences.key,
        ],
        set: {
          value: sql`to_jsonb(NOT (${accountGamePreferences.value} #>> '{}')::boolean)`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ value: accountGamePreferences.value });
    return { key, enabled: booleanOf(row?.value, GAME_PREFERENCE_DEFAULTS[key]) };
  }

  private async accountIdOf(
    steamId: string,
    mode: GameMode,
    key: GamePreferenceKey,
  ): Promise<string | null> {
    if (!GAME_PREFERENCE_MODES[key].includes(mode)) throw new PreferenceNotInMode(key, mode);
    const [account] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.steamId, BigInt(steamId)), isNull(accounts.anonymizedAt)));
    return account?.id ?? null;
  }
}

const booleanOf = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;
