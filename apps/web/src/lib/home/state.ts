import type { LiveServer } from '@carmine/contracts';

/**
 * Os estados da Home (V2): o carregando, o "amigos" (logado com amigos jogando), o "sem nada" (logado, os
 * amigos fora), o deslogado e o "offline" (nenhum servidor no ar), mais o "indisponível" (a API não respondeu
 * e a conexão ao vivo ainda não voltou), que não é um dos cinco do desenho mas existe na vida real.
 */
export type HomeState =
  | 'carregando'
  | 'indisponivel'
  | 'offline'
  | 'deslogado'
  | 'amigos'
  | 'sem-nada';

/** No ar: com batimento recente (online ou lotado). Offline é o servidor sem batimento. */
export const isLiveServer = (server: Pick<LiveServer, 'state'>) => server.state !== 'offline';

export function homeState(input: {
  /** A lista de servidores já chegou (da leitura do servidor do site ou da conexão ao vivo). */
  listLoaded: boolean;
  /** A conexão ao vivo ainda está tentando (sem lista, é "carregando"; com a tentativa esgotada, "indisponível"). */
  connecting: boolean;
  liveCount: number;
  signedIn: boolean;
  /** Quantos amigos Steam estão jogando agora. */
  friendsNow: number;
}): HomeState {
  if (!input.listLoaded) return input.connecting ? 'carregando' : 'indisponivel';
  if (input.liveCount === 0) return 'offline';
  if (!input.signedIn) return 'deslogado';
  return input.friendsNow > 0 ? 'amigos' : 'sem-nada';
}

/** O servidor em destaque: o mais cheio entre os que estão no ar (o primeiro, no empate); nulo sem nenhum. */
export function featuredServer<T extends Pick<LiveServer, 'state' | 'players'>>(
  servers: readonly T[],
): T | null {
  let best: T | null = null;
  for (const server of servers) {
    if (!isLiveServer(server)) continue;
    if (best === null || server.players > best.players) best = server;
  }
  return best;
}

/** O total de jogadores nos servidores no ar. */
export function totalPlayers(servers: readonly Pick<LiveServer, 'state' | 'players'>[]): number {
  return servers.reduce((sum, server) => sum + (isLiveServer(server) ? server.players : 0), 0);
}

/** Os servidores na ordem do cartão: os no ar primeiro (a ordem da API dentro de cada grupo), depois os offline. */
export function orderedServers<T extends Pick<LiveServer, 'state'>>(servers: readonly T[]): T[] {
  return [...servers.filter(isLiveServer), ...servers.filter((s) => !isLiveServer(s))];
}
