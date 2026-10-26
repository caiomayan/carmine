import { PRIVATE_PLAYER_NAME, type RankingPlayer, type ServerPlayers } from '@carmine/contracts';
import { inArray } from 'drizzle-orm';
import { rankingIdentity } from '../accounts/profile-privacy.js';
import type { Database } from '../database/database.js';
import { accounts } from '../database/schema.js';
import type { GameServer } from '../game-servers/game-server-registry.js';
import { OFFLINE_AFTER_MS, type ServerPresence, toLiveServer } from './live-server-list.js';

type Row = ServerPlayers['players'][number];

const PRIVATE: RankingPlayer = {
  private: true,
  publicId: null,
  displayName: PRIVATE_PLAYER_NAME,
  avatarUrl: null,
};

/**
 * Quem está num servidor agora (S12b, D2 e D3), com time e números do placar. A identidade segue
 * a regra do Ranking (`rankingIdentity`): Perfil privado vira "Jogador privado", sem ID nem avatar
 * (sem link), mas continua sendo uma linha, então o total é o do servidor. Presença sem Conta
 * (connect que não chegou, Conta anonimizada) também vira "Jogador privado": nada que a identifique.
 */
export class ServerPlayersReader {
  constructor(
    private readonly db: Database,
    private readonly offlineAfterMs = OFFLINE_AFTER_MS,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async read(
    server: GameServer,
    presence: ServerPresence | undefined,
    viewerAccountId: string | null,
  ): Promise<ServerPlayers> {
    const now = this.clock();
    const live = toLiveServer(server, presence, now, this.offlineAfterMs);
    const base = {
      serverId: server.id,
      mode: server.mode,
      state: live.state,
      map: live.map,
      maxPlayers: live.maxPlayers,
      match: live.match ?? null,
      updatedAt: live.lastHeartbeatAt,
    };
    if (presence === undefined || live.state === 'offline') {
      return { ...base, scoreboard: false, players: [] };
    }

    const found =
      presence.players.length === 0
        ? []
        : await this.db
            .select({
              id: accounts.id,
              steamId: accounts.steamId,
              publicId: accounts.publicId,
              displayName: accounts.displayName,
              avatarUrl: accounts.avatarUrl,
              profilePrivate: accounts.profilePrivate,
              anonymizedAt: accounts.anonymizedAt,
            })
            .from(accounts)
            .where(inArray(accounts.steamId, presence.players.map(BigInt)));
    const accountOf = new Map(found.map((account) => [account.steamId.toString(), account]));
    const board = new Map(presence.scoreboard?.map((entry) => [entry.steamId, entry]));

    const players = presence.players.map((steamId): Row => {
      const account = accountOf.get(steamId);
      const numbers = board.get(steamId);
      const identity =
        account && account.anonymizedAt === null ? rankingIdentity(account) : undefined;
      return {
        player: !identity ? PRIVATE : identity.private ? PRIVATE : identity,
        team: numbers?.team ?? null,
        kills: numbers?.kills ?? null,
        deaths: numbers?.deaths ?? null,
        score: numbers?.score ?? null,
        self: account !== undefined && account.id === viewerAccountId,
      };
    });
    return {
      ...base,
      scoreboard: presence.scoreboard != null,
      players: players.sort(compareRows),
    };
  }
}

/** Pontos (maior primeiro), depois kills, depois nome; quem não tem número vem depois de quem tem. */
function compareRows(a: Row, b: Row): number {
  return (
    (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY) ||
    (b.kills ?? Number.NEGATIVE_INFINITY) - (a.kills ?? Number.NEGATIVE_INFINITY) ||
    a.player.displayName.localeCompare(b.player.displayName)
  );
}
