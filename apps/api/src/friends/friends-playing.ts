import type { FriendsPlaying, PlayingFriend } from '@carmine/contracts';
import { inArray } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts } from '../database/schema.js';
import type { LiveServers } from '../live-servers/live-servers.js';
import type { CachedFriendLists } from './cached-friend-lists.js';

/** Quantas listas de outros jogadores a Steam recebe ao mesmo tempo para um pedido. */
const LOOKUP_CONCURRENCY = 6;

/**
 * "Seus amigos jogando agora" (S06): a lista de amigos Steam da Conta cruzada com a presença
 * nos Servidores Carmine. Só aparece quem tem Conta (todo mundo que conectou num Servidor
 * Carmine tem, salvo o connect que ficou na fila do plugin com a API fora).
 *
 * Com a lista da Conta privada, o caminho inverso: a amizade na Steam é mútua, então quem está
 * jogando agora e tem a Conta na própria lista pública é amigo dela. Não expõe nada novo (só
 * amigos mútuos, só quem está jogando) e o custo é limitado aos jogadores presentes, pelo
 * cache das listas e pelo teto de consultas simultâneas.
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
    if (list.status === 'unavailable') {
      return { status: 'unavailable' };
    }
    if (list.status === 'private') {
      const mutual = await this.mutualFriendsPlaying(steamId);
      return { status: 'private', friends: await this.describe(mutual) };
    }
    const playing = await this.live.whereArePlaying(list.steamIds);
    return { status: 'ok', friends: await this.describe(playing) };
  }

  /**
   * Quem está jogando agora e tem esta Conta na própria lista de amigos: SteamID64 → servidor.
   * Lista privada ou sem resposta não conta. Com a Steam falhando (ou limitando), as consultas
   * que faltam são abandonadas: o que já foi achado fica, o resto espera o cache expirar.
   */
  private async mutualFriendsPlaying(steamId: string): Promise<Map<string, string>> {
    const playing = await this.live.playingNow();
    playing.delete(steamId);
    const candidates = [...playing.keys()];
    const mutual = new Map<string, string>();
    let steamFailing = false;
    const worker = async () => {
      for (let next = candidates.pop(); next !== undefined; next = candidates.pop()) {
        if (steamFailing) return;
        const theirs = await this.friendLists.of(next);
        if (theirs.status === 'unavailable') steamFailing = true;
        else if (theirs.status === 'ok' && theirs.steamIds.includes(steamId)) {
          mutual.set(next, playing.get(next) as string);
        }
      }
    };
    await Promise.all(Array.from({ length: LOOKUP_CONCURRENCY }, worker));
    return mutual;
  }

  /** As Contas dos que estão jogando (SteamID64 → servidor), em ordem alfabética. */
  private async describe(playing: Map<string, string>): Promise<PlayingFriend[]> {
    if (playing.size === 0) {
      return [];
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
    return rows
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
  }
}
