import type { FriendsPlaying, PlayingFriend } from '@carmine/contracts';
import { inArray } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts } from '../database/schema.js';
import type { LiveServers } from '../live-servers/live-servers.js';
import type { CachedFriendLists } from './cached-friend-lists.js';

/**
 * "Seus amigos jogando agora" (S06): a lista de amigos Steam da Conta cruzada com a presença
 * nos Servidores Carmine. Só aparece quem tem Conta (todo mundo que conectou num Servidor
 * Carmine tem, salvo o connect que ficou na fila do plugin com a API fora).
 */
export class FriendsPlayingFinder {
  constructor(
    private readonly friendLists: CachedFriendLists,
    private readonly live: LiveServers,
    private readonly db: Database,
  ) {}

  /** Rejeita só se a presença (Postgres ou Valkey) falhar. */
  async of(steamId: string): Promise<FriendsPlaying> {
    const list = await this.friendLists.of(steamId);
    if (list.status !== 'ok') {
      return { status: list.status };
    }
    const playing = await this.live.whereArePlaying(list.steamIds);
    if (playing.size === 0) {
      return { status: 'ok', friends: [] };
    }
    const rows = await this.db
      .select({
        steamId: accounts.steamId,
        publicId: accounts.publicId,
        displayName: accounts.displayName,
        avatarUrl: accounts.avatarUrl,
      })
      .from(accounts)
      .where(inArray(accounts.steamId, [...playing.keys()].map(BigInt)));
    const friends: PlayingFriend[] = rows
      .map((row) => {
        const friendSteamId = row.steamId.toString();
        return {
          steamId: friendSteamId,
          publicId: row.publicId,
          displayName: row.displayName,
          avatarUrl: row.avatarUrl,
          serverId: playing.get(friendSteamId) as string,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'));
    return { status: 'ok', friends };
  }
}
