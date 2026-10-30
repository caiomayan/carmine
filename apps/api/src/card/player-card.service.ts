import type { GameMode, PlayerCard } from '@carmine/contracts';
import type { AccountsService } from '../accounts/accounts.service.js';
import type { FriendsPlayingFinder } from '../friends/friends-playing.js';
import type { WeeklyRanking } from '../stats/weekly-ranking.js';
import type { VipPeriods } from '../vip/vip-periods.js';
import { buildPlayerCard } from './player-cards.js';

/** Uma leitura que enfeita o card e pode falhar sem derrubá-lo: o nome sempre aparece. */
async function optional<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

/** Junta o que o card de boas-vindas mostra (S19) numa só resposta. */
export class PlayerCards {
  constructor(
    private readonly accounts: AccountsService,
    private readonly vip: VipPeriods,
    private readonly ranking: WeeklyRanking,
    private readonly friends: FriendsPlayingFinder,
  ) {}

  /** `null` se a Conta não existe (ou foi anonimizada). */
  async of(steamId: string, mode: GameMode): Promise<PlayerCard | null> {
    const account = await this.accounts.findBySteamId(steamId);
    if (!account || account.anonymizedAt !== null) return null;
    const [vip, viewer, friends] = await Promise.all([
      this.vip.statusOf(account.id),
      optional(async () => (await this.ranking.read(mode, undefined, account.id)).viewer),
      optional(() => this.friends.of(steamId)),
    ]);
    return buildPlayerCard({
      mode,
      displayName: account.displayName,
      vipActive: vip.active,
      viewer,
      friends,
    });
  }
}
