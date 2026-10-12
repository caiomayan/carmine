import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { SteamFriendList, SteamFriends } from '../accounts/steam-profiles.js';

/** A lista de amigos, ou a Steam indisponível (sem resposta, com erro ou sem chave). */
export type FriendListLookup = SteamFriendList | { status: 'unavailable' };

const KEY_PREFIX = 'steam:friends:';

/** Amizades mudam pouco; a presença (quem está jogando) é sempre a atual. */
const LIST_TTL_SECONDS = 60;
/** Com a Steam fora, não insistir a cada carga da home. */
const UNAVAILABLE_TTL_SECONDS = 15;

const cachedSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), steamIds: z.array(z.string()) }),
  z.object({ status: z.literal('private') }),
  z.object({ status: z.literal('unavailable') }),
]);

/**
 * Listas de amigos Steam com cache curto no Valkey, para a home não estourar o limite da Steam
 * Web API. Pedidos simultâneos da mesma lista viram uma ida só à Steam. Nunca rejeita: o Valkey
 * fora só desliga o cache; a Steam fora vira `unavailable`.
 */
export class CachedFriendLists {
  private readonly logger = new Logger(CachedFriendLists.name);
  private readonly inFlight = new Map<string, Promise<FriendListLookup>>();

  /** `steam` nulo quando não há chave da Steam Web API. */
  constructor(
    private readonly steam: SteamFriends | null,
    private readonly valkey: Redis,
  ) {}

  async of(steamId: string): Promise<FriendListLookup> {
    if (this.steam === null) {
      return { status: 'unavailable' };
    }
    const cached = await this.read(steamId);
    if (cached !== null) {
      return cached;
    }
    const pending = this.inFlight.get(steamId);
    if (pending) {
      return pending;
    }
    const lookup = this.fetch(this.steam, steamId).finally(() => this.inFlight.delete(steamId));
    this.inFlight.set(steamId, lookup);
    return lookup;
  }

  private async fetch(steam: SteamFriends, steamId: string): Promise<FriendListLookup> {
    let lookup: FriendListLookup;
    try {
      lookup = await steam.friendsOf(steamId);
    } catch (error) {
      this.logger.warn(`Amigos Steam de ${steamId} indisponíveis: ${(error as Error).message}`);
      lookup = { status: 'unavailable' };
    }
    const ttl = lookup.status === 'unavailable' ? UNAVAILABLE_TTL_SECONDS : LIST_TTL_SECONDS;
    await this.valkey
      .set(KEY_PREFIX + steamId, JSON.stringify(lookup), 'EX', ttl)
      .catch(() => undefined);
    return lookup;
  }

  private async read(steamId: string): Promise<FriendListLookup | null> {
    try {
      const value = await this.valkey.get(KEY_PREFIX + steamId);
      const parsed = value ? cachedSchema.safeParse(JSON.parse(value)) : null;
      return parsed?.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
