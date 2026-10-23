import {
  ACTIVITY_MAX_EVENTS,
  type ActivityEvent,
  type ActivityServer,
  PRIVATE_PLAYER_NAME,
  type RankingPlayer,
  type RecentActivity,
  recentActivitySchema,
} from '@carmine/contracts';
import { inArray } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Database } from '../database/database.js';
import { accounts } from '../database/schema.js';
import type { GameServerRegistry } from '../game-servers/game-server-registry.js';
import type { ActivityFeed, StoredActivity } from './activity-feed.js';

const CACHE_KEY = 'activity:response:v1';
/** A faixa nunca mostra um "entrou" de horas atrás. */
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface Identity {
  publicId: number;
  displayName: string;
  avatarUrl: string | null;
  profilePrivate: boolean;
}

/**
 * A resposta pública da faixa de atividade. Identidade e Perfil privado são lidos na hora (não
 * ficam no Valkey), então ligar o Perfil privado ou apagar a Conta vale na próxima leitura.
 *
 * Privacidade: o Perfil privado (S11) esconde Estatísticas e Ranking, e a presença em servidor e
 * o Loadout nunca foram mostrados a quem não é amigo. A faixa é um canal novo, público e em
 * tempo real; por isso quem tem o Perfil privado **não aparece** em entrar, multi-kill e skin
 * equipada. O primeiro lugar da semana é a exceção: o Ranking já o mostra a todos, e lá o Perfil
 * privado é "Jogador privado"; a faixa faz o mesmo.
 */
export class RecentActivityReader {
  /** Pedidos que chegam com o cache vazio esperam a mesma montagem. */
  private building: Promise<RecentActivity> | null = null;

  constructor(
    private readonly deps: {
      db: Database;
      valkey: Redis;
      feed: ActivityFeed;
      servers: GameServerRegistry;
    },
    private readonly cacheTtlSeconds: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async read(): Promise<RecentActivity> {
    const cached = await this.cached();
    if (cached) return cached;
    this.building ??= this.build()
      .then(async (fresh) => {
        await this.store(fresh);
        return fresh;
      })
      .finally(() => {
        this.building = null;
      });
    return this.building;
  }

  /** Quanto tempo quem pede pode reaproveitar a resposta; 0 se o cache está desligado. */
  get cacheSeconds(): number {
    return this.cacheTtlSeconds;
  }

  private async build(): Promise<RecentActivity> {
    const now = this.now();
    const stored = (await this.deps.feed.recent()).filter(
      (event) => now.getTime() - Date.parse(event.at) <= MAX_AGE_MS,
    );
    const [identities, servers] = await Promise.all([
      this.identities(stored),
      this.deps.servers.list(),
    ]);
    const serverById = new Map<string, ActivityServer>(
      servers.map((server) => [
        server.id,
        {
          id: server.id,
          name: server.name,
          showcaseName: server.showcaseName,
          code: server.code,
          mode: server.mode,
        },
      ]),
    );
    const events = stored
      .flatMap((event) => {
        const who = identities.get(event.accountId);
        const shown = who ? toEvent(event, who, serverById) : null;
        return shown ? [shown] : [];
      })
      .slice(0, ACTIVITY_MAX_EVENTS);
    return recentActivitySchema.parse({ events, generatedAt: now.toISOString() });
  }

  private async identities(stored: StoredActivity[]): Promise<Map<string, Identity>> {
    const ids = [...new Set(stored.map((event) => event.accountId))];
    if (ids.length === 0) return new Map();
    const rows = await this.deps.db
      .select({
        id: accounts.id,
        publicId: accounts.publicId,
        displayName: accounts.displayName,
        avatarUrl: accounts.avatarUrl,
        profilePrivate: accounts.profilePrivate,
        anonymizedAt: accounts.anonymizedAt,
      })
      .from(accounts)
      .where(inArray(accounts.id, ids));
    return new Map(
      rows
        .filter((row) => row.anonymizedAt === null)
        .map((row) => [
          row.id,
          {
            publicId: row.publicId,
            displayName: row.displayName,
            avatarUrl: row.avatarUrl,
            profilePrivate: row.profilePrivate,
          },
        ]),
    );
  }

  private async cached(): Promise<RecentActivity | null> {
    if (this.cacheTtlSeconds <= 0) return null;
    try {
      const raw = await this.deps.valkey.get(CACHE_KEY);
      const parsed = raw === null ? null : recentActivitySchema.safeParse(JSON.parse(raw));
      return parsed?.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private async store(activity: RecentActivity): Promise<void> {
    if (this.cacheTtlSeconds <= 0) return;
    await this.deps.valkey
      .set(CACHE_KEY, JSON.stringify(activity), 'EX', this.cacheTtlSeconds)
      .catch(() => undefined);
  }
}

const named = (who: Identity): RankingPlayer => ({
  private: false,
  publicId: who.publicId,
  displayName: who.displayName,
  avatarUrl: who.avatarUrl,
});

/** O acontecimento como a resposta pública o mostra, ou `null` se não deve aparecer. */
export function toEvent(
  event: StoredActivity,
  who: Identity,
  servers: ReadonlyMap<string, ActivityServer>,
): ActivityEvent | null {
  const base = { id: event.id, at: event.at };
  if (event.type === 'new_leader') {
    const player: RankingPlayer = who.profilePrivate
      ? { private: true, publicId: null, displayName: PRIVATE_PLAYER_NAME, avatarUrl: null }
      : named(who);
    return { ...base, type: 'new_leader', player, mode: event.mode };
  }
  if (who.profilePrivate) return null;
  if (event.type === 'skin_equipped') {
    return { ...base, type: 'skin_equipped', player: named(who), itemId: event.itemId };
  }
  const server = servers.get(event.serverId);
  if (!server) return null;
  return event.type === 'joined'
    ? { ...base, type: 'joined', player: named(who), server }
    : { ...base, type: 'multi_kill', player: named(who), server, kills: event.kills };
}
