import { Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Database } from '../database/database.js';
import { accounts } from '../database/schema.js';

/** Quanto tempo uma resposta fica no cache sem mudança no Loadout (nem fim de VIP antes). */
export const EQUIPPED_CACHE_TTL_MS = 5 * 60 * 1000;

/** A geração de uma Conta vive mais que qualquer resposta em cache dela. */
const GENERATION_TTL_SECONDS = 24 * 60 * 60;

const valueKey = (steamId: string) => `equipped:v5:${steamId}`;
const generationKey = (steamId: string) => `equipped:v5:gen:${steamId}`;

/** Quem muda o Loadout de uma Conta avisa aqui, depois de gravar. */
export interface LoadoutChangeListener {
  loadoutChanged(accountId: string): Promise<void>;
}

/** Uma leitura do cache: a resposta pronta, ou a geração com que gravar a nova. */
export type CacheLookup = { body: string } | { generation: string | null };

/**
 * Cache das respostas do `equipped/v5` no Valkey, por SteamID64. Toda mudança no Loadout (ou no
 * VIP, ou num Item equipado) sobe a geração da Conta; a resposta guardada leva a geração com
 * que foi calculada e só vale enquanto ela for a atual. Assim, uma leitura lenta que começou
 * antes da mudança nunca deixa no cache um Loadout velho.
 *
 * Com o Valkey fora, o cache só deixa de ajudar: a leitura vai ao Postgres e a invalidação
 * registra o aviso (a resposta velha expira em {@link EQUIPPED_CACHE_TTL_MS}).
 */
export class EquippedCache implements LoadoutChangeListener {
  private readonly logger = new Logger('EquippedCache');

  constructor(
    private readonly valkey: Redis,
    private readonly db: Database,
  ) {}

  async lookup(steamId: string): Promise<CacheLookup> {
    try {
      const [generation, value] = await this.valkey.mget(generationKey(steamId), valueKey(steamId));
      const current = generation ?? '0';
      if (value?.startsWith(`${current}|`)) return { body: value.slice(current.length + 1) };
      return { generation: current };
    } catch (error) {
      this.logger.warn(`Leitura do cache falhou: ${(error as Error).message}`);
      return { generation: null };
    }
  }

  async store(steamId: string, generation: string, body: string, ttlMs: number): Promise<void> {
    if (ttlMs <= 0) return;
    try {
      await this.valkey.set(valueKey(steamId), `${generation}|${body}`, 'PX', ttlMs);
    } catch (error) {
      this.logger.warn(`Escrita no cache falhou: ${(error as Error).message}`);
    }
  }

  async loadoutChanged(accountId: string): Promise<void> {
    const [account] = await this.db
      .select({ steamId: accounts.steamId })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (account) await this.invalidate(account.steamId.toString());
  }

  async invalidate(steamId: string): Promise<void> {
    try {
      await this.valkey
        .multi()
        .incr(generationKey(steamId))
        .expire(generationKey(steamId), GENERATION_TTL_SECONDS)
        .exec();
    } catch (error) {
      this.logger.warn(
        `Invalidação do equipped de ${steamId} falhou (vale em até ${EQUIPPED_CACHE_TTL_MS / 1000} s): ${(error as Error).message}`,
      );
    }
  }
}
