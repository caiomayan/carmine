import type { LiveServer, LiveServerList, ServerHeartbeat } from '@carmine/contracts';
import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { GameServer, GameServerRegistry } from '../game-servers/game-server-registry.js';
import { buildLiveServerList, type ServerPresence } from './live-server-list.js';
import type { ServerPresenceSamples } from './server-presence-samples.js';
import type { ServerPresenceStore } from './server-presence-store.js';

export interface LiveServersOptions {
  /** Sem batimento por esse tempo, o servidor fica offline. */
  offlineAfterMs: number;
  /** Intervalo da varredura que percebe quem ficou offline e avisa quem está ouvindo. */
  sweepMs: number;
}

export type LiveServersListener = (list: LiveServerList) => void;

/**
 * Os Servidores Carmine ao vivo (S06): recebe os batimentos, monta a lista pública e avisa quem
 * está ouvindo (a home, por SSE) sempre que algo visível muda. Um batimento avisa na hora; a
 * varredura periódica pega o que muda sem batimento (um servidor que caiu) e o que chegou por
 * outra instância da API, que só compartilha o Valkey.
 */
export class LiveServers implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(LiveServers.name);
  /** Cada ouvinte e o que ele já recebeu (nulo: nada ainda). */
  private readonly listeners = new Map<LiveServersListener, string | null>();
  private sweep: NodeJS.Timeout | undefined;
  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;

  constructor(
    private readonly registry: GameServerRegistry,
    private readonly presence: ServerPresenceStore,
    private readonly options: LiveServersOptions,
    private readonly now: () => Date = () => new Date(),
    /** O amostrador de jogadores simultâneos (A1): uma amostra por minuto por servidor. Sem ele, não amostra. */
    private readonly samples: Pick<ServerPresenceSamples, 'record'> | null = null,
  ) {}

  onModuleInit(): void {
    this.sweep = setInterval(() => void this.refresh(), this.options.sweepMs);
    this.sweep.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.sweep);
    this.listeners.clear();
  }

  /** Guarda o batimento do servidor e avisa quem está ouvindo, sem esperar o aviso. */
  async recordHeartbeat(serverId: string, heartbeat: ServerHeartbeat): Promise<void> {
    const players = [...new Set(heartbeat.players)];
    await this.presence.save(serverId, {
      map: heartbeat.map,
      players,
      maxPlayers: heartbeat.maxPlayers,
      at: this.now(),
      // O estado inteiro de cada batimento: sem `match`, o placar anterior não sobra.
      match: heartbeat.match ?? null,
      scoreboard: heartbeat.scoreboard ?? null,
    });
    // Sem esperar e sem nunca falhar o batimento (o amostrador engole os próprios erros).
    void this.samples?.record(serverId, players.length, this.now());
    void this.refresh();
  }

  /** Um servidor em operação e o último batimento dele; nulo se não existe ou foi aposentado. */
  async find(
    serverId: string,
  ): Promise<{ server: GameServer; presence: ServerPresence | undefined } | null> {
    const server = (await this.registry.list()).find((candidate) => candidate.id === serverId);
    if (!server) return null;
    const presences = await this.presence.readAll([server.id]);
    return { server, presence: presences.get(server.id) };
  }

  /** A lista pública agora; rejeita se o Postgres ou o Valkey falharem. */
  async current(): Promise<LiveServerList> {
    const servers = await this.registry.list();
    const presences = await this.presence.readAll(servers.map((server) => server.id));
    return buildLiveServerList(servers, presences, this.now(), this.options.offlineAfterMs);
  }

  /**
   * Onde está cada um destes SteamID64 que está jogando agora (num servidor que não está
   * offline): SteamID64 → id do servidor.
   */
  async whereArePlaying(steamIds: Iterable<string>): Promise<Map<string, string>> {
    const wanted = new Set(steamIds);
    if (wanted.size === 0) {
      return new Map();
    }
    const playing = await this.playingNow();
    for (const steamId of playing.keys()) {
      if (!wanted.has(steamId)) playing.delete(steamId);
    }
    return playing;
  }

  /** Todo SteamID64 que está jogando agora (num servidor que não está offline) → id do servidor. */
  async playingNow(): Promise<Map<string, string>> {
    const playing = new Map<string, string>();
    const servers = await this.registry.list();
    const presences = await this.presence.readAll(servers.map((server) => server.id));
    const now = this.now().getTime();
    for (const [serverId, presence] of presences) {
      if (now - presence.at.getTime() >= this.options.offlineAfterMs) continue;
      for (const steamId of presence.players) playing.set(steamId, serverId);
    }
    return playing;
  }

  /** O servidor onde este SteamID64 está jogando agora (não offline), ou `null`. */
  async serverOf(steamId: string): Promise<LiveServer | null> {
    const serverId = (await this.whereArePlaying([steamId])).get(steamId);
    if (serverId === undefined) {
      return null;
    }
    const { servers } = await this.current();
    return servers.find((server) => server.id === serverId) ?? null;
  }

  /**
   * Recebe a lista logo em seguida e depois a cada mudança visível; devolve a função que para
   * de ouvir.
   */
  subscribe(listener: LiveServersListener): () => void {
    this.listeners.set(listener, null);
    void this.refresh();
    return () => this.listeners.delete(listener);
  }

  /**
   * Remonta a lista e a entrega a quem ainda não a viu. Sem ninguém ouvindo, não consulta nada.
   * Chamadas durante uma remontagem viram uma só, logo depois dela.
   */
  private refresh(): Promise<void> {
    if (this.listeners.size === 0) {
      return Promise.resolve();
    }
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = this.notifyIfChanged()
      .catch((error: unknown) =>
        this.logger.warn(`Servidores ao vivo indisponíveis: ${(error as Error).message}`),
      )
      .finally(() => {
        this.refreshing = null;
        if (this.refreshAgain) {
          this.refreshAgain = false;
          void this.refresh();
        }
      });
    return this.refreshing;
  }

  private async notifyIfChanged(): Promise<void> {
    const list = await this.current();
    const key = changeKey(list);
    for (const [listener, received] of this.listeners) {
      if (received !== key) {
        this.listeners.set(listener, key);
        listener(list);
      }
    }
  }
}

/**
 * O que, mudando, vale um evento: o horário de cada batimento muda a cada 10 s sem que nada
 * visível mude, então fica fora (assim como o `generatedAt`).
 */
function changeKey(list: LiveServerList): string {
  return JSON.stringify({
    servers: list.servers.map(({ lastHeartbeatAt: _, ...server }) => server),
    summary: list.summary,
  });
}
