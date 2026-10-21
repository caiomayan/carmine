/**
 * Regras da home ao vivo (S06), sem React: Conectar, filtro por Modo, lotação, amigos e o estado
 * da conexão ao vivo. Os tipos vêm do contrato (`@carmine/contracts`, live-servers).
 */
import type { FriendsPlaying, LiveServer, LiveServerList, PlayingFriend } from '@carmine/contracts';
import type { ModeFilter } from './modes';

/** Abre o CS2 já conectando ao Servidor Carmine. */
export const steamConnectUrl = (address: string) => `steam://connect/${address}`;

/**
 * Os servidores de um filtro de Modo, na ordem da API (por Modo e nome), com os offline no
 * fim: quem abre a home vê primeiro onde dá para jogar.
 */
export function serversOfMode(servers: LiveServer[], mode: ModeFilter): LiveServer[] {
  const ofMode = mode === 'all' ? servers : servers.filter((s) => s.mode === mode);
  return [
    ...ofMode.filter((s) => s.state !== 'offline'),
    ...ofMode.filter((s) => s.state === 'offline'),
  ];
}

/** A partir daqui a barra de lotação avisa que está quase cheio. */
const HIGH_OCCUPANCY = 0.75;

export type OccupancyLevel = 'none' | 'normal' | 'high' | 'full';

/** A barra de jogadores: quanto está cheia (0 a 1) e o nível, que decide a cor de contexto. */
export function occupancy(server: LiveServer): { ratio: number; level: OccupancyLevel } {
  if (server.state === 'offline') return { ratio: 0, level: 'none' };
  const ratio = Math.min(1, server.players / server.maxPlayers);
  if (server.state === 'full') return { ratio, level: 'full' };
  return { ratio, level: ratio >= HIGH_OCCUPANCY ? 'high' : 'normal' };
}

export type FriendOnServer = {
  friend: PlayingFriend;
  /** Nulo se o servidor não está na lista ao vivo que a página tem. */
  server: LiveServer | null;
  /** "Entrar no mesmo servidor" só faz sentido com o servidor no ar. */
  joinable: boolean;
};

/** Junta cada amigo ao Servidor Carmine onde ele está, pela lista ao vivo da página. */
export function friendsWithServers(
  friends: PlayingFriend[],
  servers: LiveServer[],
): FriendOnServer[] {
  const byId = new Map(servers.map((s) => [s.id, s]));
  return friends.map((friend) => {
    const server = byId.get(friend.serverId) ?? null;
    return { friend, server, joinable: !!server && server.state !== 'offline' };
  });
}

/**
 * A lista ao vivo da home: o último estado conhecido e a conexão. `confirmedAt` é até quando
 * esse estado foi confirmado: com a conexão viva é sempre "agora"; caída, é o momento da queda
 * (ou a leitura do servidor do site, se nunca conectou). É daí que sai o "atualizado há X s".
 */
export type LiveState = {
  list: LiveServerList | null;
  connection: 'connecting' | 'live' | 'lost';
  confirmedAt: number | null;
};

export type LiveEvent =
  | { type: 'snapshot'; list: LiveServerList; at: number }
  | { type: 'lost'; at: number };

export function initialLive(list: LiveServerList | null): LiveState {
  return {
    list,
    connection: 'connecting',
    confirmedAt: list ? Date.parse(list.generatedAt) : null,
  };
}

export function liveReducer(state: LiveState, event: LiveEvent): LiveState {
  if (event.type === 'lost') {
    if (state.connection === 'lost') return state;
    return {
      ...state,
      connection: 'lost',
      confirmedAt: state.connection === 'live' ? event.at : state.confirmedAt,
    };
  }
  const older =
    state.list && Date.parse(event.list.generatedAt) < Date.parse(state.list.generatedAt);
  return { list: older ? state.list : event.list, connection: 'live', confirmedAt: event.at };
}

/** Segundos desde a última confirmação, só com a conexão caída; nulo enquanto está ao vivo. */
export function updatedSecondsAgo(state: LiveState, now: number): number | null {
  if (state.connection !== 'lost' || state.confirmedAt === null) return null;
  return Math.max(0, Math.floor((now - state.confirmedAt) / 1000));
}

/** O bloco "Seus amigos jogando agora": a resposta da API, mais o carregando e a lista antiga. */
export type FriendsView =
  | { status: 'loading' }
  | { status: 'ok'; friends: PlayingFriend[]; stale: boolean }
  | { status: 'private' }
  | { status: 'unavailable' };

/**
 * O próximo estado do bloco a cada leitura (`failed`: nem a API respondeu). Uma falha depois
 * de uma lista boa não apaga a lista: ela fica, marcada como a última vista.
 */
export function nextFriends(previous: FriendsView, result: FriendsPlaying | 'failed'): FriendsView {
  if (result !== 'failed' && result.status === 'ok') {
    return { status: 'ok', friends: result.friends, stale: false };
  }
  const failed = result === 'failed' || result.status === 'unavailable';
  if (failed && previous.status === 'ok') return { ...previous, stale: true };
  return failed ? { status: 'unavailable' } : { status: 'private' };
}

/** Nome que a home mostra: o nome de vitrine (S07) ou, sem ele, o identificador da Staff. */
export function serverLabel(server: Pick<LiveServer, 'name' | 'showcaseName'>): string {
  return server.showcaseName ?? server.name;
}

/** Nome com o código, para rótulos de leitor de tela ("Retake · Rotação (SP·2)"). */
export function serverFullLabel(
  server: Pick<LiveServer, 'name' | 'showcaseName' | 'code'>,
): string {
  return server.code ? `${serverLabel(server)} (${server.code})` : serverLabel(server);
}

/** Até este número de servidores no ar a home mostra cartões grandes; acima, lista (U2). */
export const MAX_CARD_SERVERS = 6;

export type ServersLayout = {
  kind: 'cards' | 'list';
  /** Os servidores no ar (online ou lotados), na ordem recebida. */
  live: LiveServer[];
  /** Os offline, que nunca ganham cartão: viram linhas leves no fim. */
  offline: LiveServer[];
  /** Colunas da grade de cartões em telas largas: nenhuma linha termina com buraco. */
  columns: 1 | 2 | 3;
};

const COLUMNS: Record<number, 1 | 2 | 3> = { 1: 1, 2: 2, 3: 3, 4: 2, 5: 2, 6: 3 };

/**
 * Cartões ou lista. Só contam os servidores no ar: os offline (de teste, em manutenção) não
 * empurram a home para a lista e não pesam na tela.
 */
export function serversLayout(servers: LiveServer[]): ServersLayout {
  const live = servers.filter((s) => s.state !== 'offline');
  const offline = servers.filter((s) => s.state === 'offline');
  const kind = live.length > MAX_CARD_SERVERS ? 'list' : 'cards';
  const columns = COLUMNS[live.length] ?? 1;
  return { kind, live, offline, columns };
}

/** O grupo "Offline (n)" já nasce aberto com poucos servidores ou quando nada está no ar. */
export function offlineGroupOpen(liveCount: number, offlineCount: number): boolean {
  return liveCount === 0 || offlineCount <= 2;
}

/** Os amigos de cada servidor (pelo `id`), na ordem recebida: os avatares do cartão. */
export function friendsByServer(friends: PlayingFriend[]): Map<string, PlayingFriend[]> {
  const grouped = new Map<string, PlayingFriend[]>();
  for (const friend of friends) {
    const list = grouped.get(friend.serverId);
    if (list) list.push(friend);
    else grouped.set(friend.serverId, [friend]);
  }
  return grouped;
}
