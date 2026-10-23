import {
  type GameMode,
  type HeaderInventory,
  type HeaderLoadout,
  type HeaderPlay,
  type HeaderPreviews,
  type HeaderRanking,
  type HeaderRankingMode,
  headerPlaySchema,
  headerRankingSchema,
  type InventoryItem,
  type LoadoutSide,
  type PlayingFriend,
  type Ranking,
} from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { AccountsService } from '../accounts/accounts.service.js';
import type { Database } from '../database/database.js';
import { accountStatsWeekly } from '../database/schema.js';
import type { FriendsPlayingFinder } from '../friends/friends-playing.js';
import type { Inventory } from '../inventory/inventory.js';
import type { LiveServers } from '../live-servers/live-servers.js';
import type { Loadouts } from '../loadout/loadouts.js';
import { weekClosesAt, weekEndOf, weekStartOf } from '../stats/stats-week.js';
import type { WeeklyRanking } from '../stats/weekly-ranking.js';
import { inventoryPreview, loadoutPreview, rankingModePreview } from './previews.js';
import { recommendServers } from './recommend-servers.js';

const MODES: readonly GameMode[] = ['retake', 'deathmatch'];

/** O que fica no cache: os painéis Jogar e Ranking. Loadout e Inventário saem sempre frescos. */
const sharedSchema = z.object({
  play: headerPlaySchema,
  ranking: headerRankingSchema.nullable(),
});
type Shared = z.infer<typeof sharedSchema>;

const cacheKey = (accountId: string | null) =>
  accountId === null ? 'header-previews:v2:anon' : `header-previews:v2:account:${accountId}`;

const EMPTY_PLAY: HeaderPlay = { recommended: null, others: [], friendsPlaying: null };

/** Acompanha se alguma fonte falhou neste pedido: resposta degradada não vai para o cache. */
interface Run {
  degraded: boolean;
}

/**
 * As prévias do header (U3e) numa resposta só. Cada seção é independente: uma fonte que falha
 * (Steam, Ranking, Postgres, Valkey) esvazia só a seção dela, o resto segue, e o endpoint nunca
 * cai por causa de uma. A única exceção é que o retrato do Loadout usa os Itens do Inventário
 * (ids e StatTrak): sem eles, o Loadout também vem vazio.
 *
 * Os painéis Jogar e Ranking ficam num cache curto no Valkey (por Conta, ou um só para o
 * visitante) e só quando nenhuma fonte falhou, para uma queda curta não virar um painel vazio de
 * 15 s. Loadout e Inventário são lidos na hora: quem acabou de equipar uma skin vê na prévia. As
 * fontes caras já têm cache próprio (listas da Steam 60 s, ordem do Ranking 45 s, presença no
 * Valkey).
 */
export class HeaderPreviewsReader {
  private readonly logger = new Logger(HeaderPreviewsReader.name);

  constructor(
    private readonly deps: {
      db: Database;
      valkey: Redis;
      accounts: AccountsService;
      live: LiveServers;
      friends: FriendsPlayingFinder;
      loadouts: Loadouts;
      inventory: Inventory;
      ranking: WeeklyRanking;
    },
    private readonly cacheTtlSeconds: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** `accountId` nulo é o visitante. `side` é o último lado usado no Loadout. */
  async read(accountId: string | null, side: LoadoutSide): Promise<HeaderPreviews> {
    const [shared, personal] = await Promise.all([
      this.shared(accountId),
      accountId === null
        ? Promise.resolve({ loadout: null, inventory: null })
        : this.personal(accountId, side),
    ]);
    return {
      generatedAt: this.now().toISOString(),
      signedIn: accountId !== null,
      play: shared.play,
      loadout: personal.loadout,
      inventory: personal.inventory,
      ranking: shared.ranking,
    };
  }

  private async shared(accountId: string | null): Promise<Shared> {
    const cached = await this.cached(accountId);
    if (cached) return cached;
    const run: Run = { degraded: false };
    const [play, ranking] = await Promise.all([
      this.section(run, 'Jogar', () => this.play(run, accountId), EMPTY_PLAY),
      this.section(run, 'Ranking', () => this.rankingOf(run, accountId), null),
    ]);
    const shared = { play, ranking };
    if (!run.degraded) await this.store(accountId, shared);
    return shared;
  }

  private async play(run: Run, accountId: string | null): Promise<HeaderPlay> {
    const [list, friends, favoriteMode] = await Promise.all([
      this.deps.live.current(),
      accountId === null ? null : this.friendsPlaying(run, accountId),
      accountId === null ? null : this.favoriteMode(run, accountId),
    ]);
    const { recommended, others } = recommendServers({
      servers: list.servers,
      friends: friends ?? [],
      favoriteMode,
    });
    return { recommended, others, friendsPlaying: friends === null ? null : friends.length };
  }

  /** Os amigos jogando agora, ou nulo se a Steam não respondeu (a seção segue sem eles). */
  private async friendsPlaying(run: Run, accountId: string): Promise<PlayingFriend[] | null> {
    try {
      const account = await this.deps.accounts.findById(accountId);
      if (account === null) return null;
      const result = await this.deps.friends.of(account.steamId);
      if (result.status === 'unavailable') {
        // A Steam fora (ou sem chave) não vira cache: o painel volta com os amigos quando ela voltar.
        run.degraded = true;
        return null;
      }
      return result.friends;
    } catch (error) {
      run.degraded = true;
      this.logger.warn(`Amigos jogando indisponíveis: ${(error as Error).message}`);
      return null;
    }
  }

  /** O Modo em que a Conta mais tem tempo de jogo, somando as semanas. */
  private async favoriteMode(run: Run, accountId: string): Promise<GameMode | null> {
    try {
      const seconds = sql<number>`sum(${accountStatsWeekly.secondsPlayed})`;
      const [top] = await this.deps.db
        .select({ mode: accountStatsWeekly.mode })
        .from(accountStatsWeekly)
        .where(eq(accountStatsWeekly.accountId, accountId))
        .groupBy(accountStatsWeekly.mode)
        .orderBy(desc(seconds))
        .limit(1);
      return top?.mode ?? null;
    } catch (error) {
      run.degraded = true;
      this.logger.warn(`Modo preferido indisponível: ${(error as Error).message}`);
      return null;
    }
  }

  private async personal(
    accountId: string,
    side: LoadoutSide,
  ): Promise<{ loadout: HeaderLoadout | null; inventory: HeaderInventory | null }> {
    const run: Run = { degraded: false };
    const items = await this.section<InventoryItem[] | null>(
      run,
      'Inventário',
      () => this.deps.inventory.list(accountId),
      null,
    );
    const loadout = await this.section<HeaderLoadout | null>(
      run,
      'Loadout',
      async () => {
        if (items === null) return null;
        const byUid = new Map(items.map((item) => [item.uid, item]));
        return loadoutPreview(await this.deps.loadouts.get(accountId), byUid, side);
      },
      null,
    );
    return { loadout, inventory: items === null ? null : inventoryPreview(items) };
  }

  /**
   * Cada Modo que respondeu entra; nulo só se nenhum respondeu. A semana é a mesma nos dois
   * Modos (lida uma vez), mesmo que o pedido caia na virada de segunda-feira.
   */
  private async rankingOf(run: Run, accountId: string | null): Promise<HeaderRanking | null> {
    const weekStart = weekStartOf(this.now());
    const results = await Promise.all(
      MODES.map((mode) =>
        this.section<Ranking | null>(
          run,
          `Ranking (${mode})`,
          () => this.deps.ranking.read(mode, weekStart, accountId),
          null,
        ),
      ),
    );
    const available = results.filter((ranking): ranking is Ranking => ranking !== null);
    if (available.length === 0) return null;
    const modes: HeaderRankingMode[] = available.map(rankingModePreview);
    return { weekStart, weekEnd: weekEndOf(weekStart), closesAt: weekClosesAt(weekStart), modes };
  }

  private async section<T>(
    run: Run,
    name: string,
    load: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await load();
    } catch (error) {
      run.degraded = true;
      this.logger.warn(`Prévia "${name}" indisponível: ${(error as Error).message}`);
      return fallback;
    }
  }

  private async cached(accountId: string | null): Promise<Shared | null> {
    if (this.cacheTtlSeconds <= 0) return null;
    try {
      const raw = await this.deps.valkey.get(cacheKey(accountId));
      const parsed = raw === null ? null : sharedSchema.safeParse(JSON.parse(raw));
      return parsed?.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async store(accountId: string | null, shared: Shared): Promise<void> {
    if (this.cacheTtlSeconds <= 0) return;
    await this.deps.valkey
      .set(cacheKey(accountId), JSON.stringify(shared), 'EX', this.cacheTtlSeconds)
      .catch(() => undefined);
  }
}
