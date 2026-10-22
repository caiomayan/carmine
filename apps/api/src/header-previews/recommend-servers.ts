import {
  type GameMode,
  HEADER_OTHER_SERVERS,
  type LiveServer,
  type PlayingFriend,
  type RecommendationReason,
} from '@carmine/contracts';

export interface RecommendInput {
  /** A lista pública inteira (com os offline). */
  servers: readonly LiveServer[];
  /** Os amigos jogando agora, cada um com o servidor onde está. Vazio sem sessão. */
  friends: readonly PlayingFriend[];
  /** O Modo em que a Conta mais jogou, ou nulo (sem sessão ou sem histórico). */
  favoriteMode: GameMode | null;
}

export interface Recommendation {
  recommended: {
    server: LiveServer;
    reason: RecommendationReason;
    friends: PlayingFriend[];
  } | null;
  others: LiveServer[];
}

/** Servidor com vaga antes de lotado, depois o mais cheio; o nome desempata e deixa a escolha estável. */
const fullestFirst = (a: LiveServer, b: LiveServer) =>
  Number(a.state === 'full') - Number(b.state === 'full') ||
  b.players - a.players ||
  a.name.localeCompare(b.name);

/**
 * Qual servidor o painel "Jogar" do header recomenda (U3e), nesta ordem:
 * 1. onde estão os amigos (o servidor com mais deles; empate: o que tem vaga e mais gente);
 * 2. o servidor mais cheio do Modo em que a pessoa mais joga;
 * 3. o mais cheio de todos.
 * Só entra servidor no ar (online ou lotado); lotado só é recomendado quando é a única opção
 * naquele critério (o VIP entra pela Vaga reservada). Os outros são até
 * {@link HEADER_OTHER_SERVERS}, do mais cheio ao menos cheio.
 */
export function recommendServers({
  servers,
  friends,
  favoriteMode,
}: RecommendInput): Recommendation {
  const live = servers.filter((server) => server.state !== 'offline');
  const choice = choose(live, friends, favoriteMode);
  if (choice === null) return { recommended: null, others: [] };
  const others = live
    .filter((server) => server.id !== choice.server.id)
    .sort((a, b) => b.players - a.players || a.name.localeCompare(b.name))
    .slice(0, HEADER_OTHER_SERVERS);
  return { recommended: choice, others };
}

function choose(
  live: readonly LiveServer[],
  friends: readonly PlayingFriend[],
  favoriteMode: GameMode | null,
): NonNullable<Recommendation['recommended']> | null {
  if (live.length === 0) return null;

  const friendsByServer = new Map<string, PlayingFriend[]>();
  for (const friend of friends) {
    const there = friendsByServer.get(friend.serverId) ?? [];
    there.push(friend);
    friendsByServer.set(friend.serverId, there);
  }
  const withFriends = live
    .filter((server) => friendsByServer.has(server.id))
    .sort(
      (a, b) =>
        (friendsByServer.get(b.id)?.length ?? 0) - (friendsByServer.get(a.id)?.length ?? 0) ||
        fullestFirst(a, b),
    );
  const [byFriends] = withFriends;
  if (byFriends) {
    return {
      server: byFriends,
      reason: 'friends',
      friends: friendsByServer.get(byFriends.id) ?? [],
    };
  }

  if (favoriteMode !== null) {
    const [byMode] = live.filter((server) => server.mode === favoriteMode).sort(fullestFirst);
    if (byMode) return { server: byMode, reason: 'favorite_mode', friends: [] };
  }

  const [fullest] = [...live].sort(fullestFirst);
  return fullest ? { server: fullest, reason: 'fullest', friends: [] } : null;
}
