import type { LiveServer, LiveServerList, PlayingFriend } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import {
  type FriendsView,
  friendsByServer,
  friendsWithServers,
  initialLive,
  liveReducer,
  MAX_CARD_SERVERS,
  nextFriends,
  occupancy,
  offlineGroupOpen,
  serverFullLabel,
  serverLabel,
  serversLayout,
  serversOfMode,
  steamConnectUrl,
  updatedSecondsAgo,
} from './live-servers';

describe('Conectar a um Servidor Carmine', () => {
  it('abre o CS2 pelo steam://connect com o endereço público', () => {
    expect(steamConnectUrl('203.0.113.7:27015')).toBe('steam://connect/203.0.113.7:27015');
  });
});

const server = (over: Partial<LiveServer> = {}): LiveServer => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'retake-1',
  showcaseName: null,
  code: null,
  mode: 'retake',
  address: '203.0.113.7:27015',
  region: 'sao-paulo',
  map: 'de_mirage',
  players: 3,
  maxPlayers: 9,
  state: 'online',
  lastHeartbeatAt: '2026-10-12T12:00:00Z',
  ...over,
});

describe('filtro por Modo', () => {
  const retake = server({ id: '00000000-0000-4000-8000-00000000000a', mode: 'retake' });
  const dm = server({ id: '00000000-0000-4000-8000-00000000000b', mode: 'deathmatch' });

  it('"Todos" mostra a lista inteira, na ordem da API', () => {
    expect(serversOfMode([dm, retake], 'all')).toEqual([dm, retake]);
  });

  it('os servidores offline vão para o fim, sem mudar a ordem dos outros', () => {
    const off = server({ id: '00000000-0000-4000-8000-00000000000c', state: 'offline' });
    const full = server({ id: '00000000-0000-4000-8000-00000000000d', state: 'full' });
    expect(serversOfMode([off, dm, full, retake], 'all')).toEqual([dm, full, retake, off]);
    expect(serversOfMode([off, retake], 'retake')).toEqual([retake, off]);
  });

  it('um Modo mostra só os servidores dele (vazio quando não há nenhum)', () => {
    expect(serversOfMode([dm, retake], 'retake')).toEqual([retake]);
    expect(serversOfMode([retake], 'deathmatch')).toEqual([]);
  });
});

describe('lotação de um servidor', () => {
  it('a barra vai de 0 a 1 e não passa de cheia', () => {
    expect(occupancy(server({ players: 0, maxPlayers: 9 })).ratio).toBe(0);
    expect(occupancy(server({ players: 3, maxPlayers: 12 })).ratio).toBe(0.25);
    expect(occupancy(server({ players: 11, maxPlayers: 9, state: 'full' })).ratio).toBe(1);
  });

  it('o nível acompanha o estado: lotado, quase cheio (a partir de 75%) ou com vagas', () => {
    expect(occupancy(server({ players: 9, maxPlayers: 9, state: 'full' })).level).toBe('full');
    expect(occupancy(server({ players: 12, maxPlayers: 16 })).level).toBe('high');
    expect(occupancy(server({ players: 11, maxPlayers: 16 })).level).toBe('normal');
  });

  it('offline não tem lotação', () => {
    expect(occupancy(server({ players: 0, map: null, state: 'offline' }))).toEqual({
      ratio: 0,
      level: 'none',
    });
  });
});

describe('amigos jogando agora', () => {
  const online = server({ id: '00000000-0000-4000-8000-0000000000c1', name: 'retake-1' });
  const off = server({
    id: '00000000-0000-4000-8000-0000000000c2',
    name: 'dm-1',
    state: 'offline',
    map: null,
    players: 0,
  });
  const friend = (serverId: string, n: number): PlayingFriend => ({
    steamId: `7656119800000000${n}`,
    publicId: 10_000 + n,
    displayName: `Amigo ${n}`,
    avatarUrl: null,
    serverId,
  });

  it('cada amigo vem com o servidor onde está, e dá para entrar no mesmo servidor', () => {
    expect(friendsWithServers([friend(online.id, 1)], [online, off])).toEqual([
      { friend: friend(online.id, 1), server: online, joinable: true },
    ]);
  });

  it('um servidor que caiu ou sumiu da lista não deixa entrar', () => {
    expect(
      friendsWithServers(
        [friend(off.id, 2), friend('00000000-0000-4000-8000-0000000000ff', 3)],
        [online, off],
      ).map((f) => [f.server?.name ?? null, f.joinable]),
    ).toEqual([
      ['dm-1', false],
      [null, false],
    ]);
  });
});

describe('conexão ao vivo', () => {
  const list = (generatedAt: string, players = 3): LiveServerList => ({
    servers: [server({ players })],
    summary: { online: 1, players },
    generatedAt,
  });
  const T0 = Date.parse('2026-10-12T12:00:00Z');

  it('começa com o que o servidor do site leu, ainda sem conexão ao vivo', () => {
    const state = initialLive(list('2026-10-12T12:00:00Z'));
    expect(state.connection).toBe('connecting');
    expect(state.list?.summary.players).toBe(3);
  });

  it('cada evento troca a lista inteira e confirma a conexão', () => {
    const state = liveReducer(initialLive(null), {
      type: 'snapshot',
      list: list('2026-10-12T12:00:05Z', 4),
      at: T0 + 5000,
    });
    expect(state.connection).toBe('live');
    expect(state.list?.summary.players).toBe(4);
    expect(updatedSecondsAgo(state, T0 + 60_000)).toBeNull();
  });

  it('um evento mais antigo do que o que já temos é ignorado', () => {
    const fresh = liveReducer(initialLive(list('2026-10-12T12:00:10Z', 5)), {
      type: 'snapshot',
      list: list('2026-10-12T12:00:05Z', 4),
      at: T0 + 11_000,
    });
    expect(fresh.list?.summary.players).toBe(5);
    expect(fresh.connection).toBe('live');
  });

  it('se a conexão cai, fica o último estado conhecido e conta o tempo desde a queda', () => {
    const live = liveReducer(initialLive(null), {
      type: 'snapshot',
      list: list('2026-10-12T12:00:00Z', 4),
      at: T0,
    });
    const lost = liveReducer(live, { type: 'lost', at: T0 + 30_000 });
    expect(lost.connection).toBe('lost');
    expect(lost.list?.summary.players).toBe(4);
    expect(updatedSecondsAgo(lost, T0 + 42_400)).toBe(12);
  });

  it('cair de novo enquanto reconecta não reinicia a contagem', () => {
    const live = liveReducer(initialLive(null), {
      type: 'snapshot',
      list: list('2026-10-12T12:00:00Z'),
      at: T0,
    });
    const lost = liveReducer(liveReducer(live, { type: 'lost', at: T0 + 1000 }), {
      type: 'lost',
      at: T0 + 9000,
    });
    expect(updatedSecondsAgo(lost, T0 + 10_000)).toBe(9);
  });

  it('sem nunca ter conectado, a idade é a da leitura do servidor do site', () => {
    const lost = liveReducer(initialLive(list('2026-10-12T12:00:00Z')), {
      type: 'lost',
      at: T0 + 2000,
    });
    expect(updatedSecondsAgo(lost, T0 + 20_000)).toBe(20);
  });

  it('a volta da conexão traz a lista nova e para a contagem', () => {
    const back = liveReducer(
      liveReducer(initialLive(list('2026-10-12T12:00:00Z')), { type: 'lost', at: T0 }),
      { type: 'snapshot', list: list('2026-10-12T12:01:00Z', 7), at: T0 + 60_000 },
    );
    expect(back.connection).toBe('live');
    expect(back.list?.summary.players).toBe(7);
    expect(updatedSecondsAgo(back, T0 + 61_000)).toBeNull();
  });
});

describe('bloco de amigos ao atualizar', () => {
  const ok: FriendsView = {
    status: 'ok',
    friends: [
      {
        steamId: '76561198000000002',
        publicId: 10_002,
        displayName: 'Amigo',
        avatarUrl: null,
        serverId: '00000000-0000-4000-8000-0000000000c1',
      },
    ],
    stale: false,
  };

  it('a resposta da API vira o estado do bloco', () => {
    expect(nextFriends({ status: 'loading' }, { status: 'private' })).toEqual({
      status: 'private',
    });
    expect(nextFriends({ status: 'loading' }, { status: 'ok', friends: [] })).toEqual({
      status: 'ok',
      friends: [],
      stale: false,
    });
  });

  it('sem resposta na primeira vez, o bloco diz que a Steam está indisponível', () => {
    expect(nextFriends({ status: 'loading' }, 'failed')).toEqual({ status: 'unavailable' });
  });

  it('se a Steam ou a API falham depois, fica a última lista vista, marcada como antiga', () => {
    expect(nextFriends(ok, { status: 'unavailable' })).toEqual({ ...ok, stale: true });
    expect(nextFriends(ok, 'failed')).toEqual({ ...ok, stale: true });
  });

  it('a lista nova substitui a antiga e tira a marca', () => {
    expect(nextFriends({ ...ok, stale: true }, { status: 'ok', friends: [] })).toEqual({
      status: 'ok',
      friends: [],
      stale: false,
    });
  });
});

describe('nome do Servidor Carmine na home', () => {
  it('usa o nome de vitrine e, nos rótulos, o código', () => {
    const named = server({ showcaseName: 'Retake · Rotação', code: 'SP·2' });
    expect(serverLabel(named)).toBe('Retake · Rotação');
    expect(serverFullLabel(named)).toBe('Retake · Rotação (SP·2)');
  });

  it('sem nome de vitrine, cai no identificador da Staff', () => {
    expect(serverLabel(server())).toBe('retake-1');
    expect(serverFullLabel(server())).toBe('retake-1');
  });
});

describe('cartões ou lista', () => {
  const many = (n: number, over: Partial<LiveServer> = {}) =>
    Array.from({ length: n }, (_, i) =>
      server({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, ...over }),
    );

  it('até 6 servidores no ar viram cartões; com 7 ou mais, lista', () => {
    expect(serversLayout(many(1)).kind).toBe('cards');
    expect(serversLayout(many(MAX_CARD_SERVERS)).kind).toBe('cards');
    expect(serversLayout(many(MAX_CARD_SERVERS + 1)).kind).toBe('list');
  });

  it('só os servidores no ar contam: os offline nunca empurram a home para a lista', () => {
    const layout = serversLayout([...many(3), ...many(8, { state: 'offline', map: null })]);
    expect(layout.kind).toBe('cards');
    expect(layout.live).toHaveLength(3);
    expect(layout.offline).toHaveLength(8);
  });

  it('lotado conta como no ar (é um cartão com a vaga reservada)', () => {
    const layout = serversLayout([...many(2), ...many(1, { state: 'full' })]);
    expect(layout.live).toHaveLength(3);
  });

  it('separa no ar e offline sem mudar a ordem de cada grupo', () => {
    const [a, b, c] = many(3) as [LiveServer, LiveServer, LiveServer];
    const off = { ...b, state: 'offline' as const };
    const layout = serversLayout([off, a, c]);
    expect(layout.live).toEqual([a, c]);
    expect(layout.offline).toEqual([off]);
  });

  it('as colunas acompanham a quantidade, sem deixar buraco no fim', () => {
    const columns = (n: number) => serversLayout(many(n)).columns;
    expect([1, 2, 3, 4, 5, 6].map(columns)).toEqual([1, 2, 3, 2, 2, 3]);
  });

  it('sem nenhum servidor, sem colunas a inventar', () => {
    const layout = serversLayout([]);
    expect(layout).toMatchObject({ live: [], offline: [], columns: 1 });
  });
});

describe('grupo offline', () => {
  it('abre sozinho quando são poucos ou quando não há nada no ar', () => {
    expect(offlineGroupOpen(3, 1)).toBe(true);
    expect(offlineGroupOpen(3, 2)).toBe(true);
    expect(offlineGroupOpen(0, 6)).toBe(true);
  });

  it('fica recolhido quando são muitos e há servidores no ar', () => {
    expect(offlineGroupOpen(3, 3)).toBe(false);
    expect(offlineGroupOpen(1, 6)).toBe(false);
  });
});

describe('amigos em cada servidor', () => {
  const friend = (n: number, serverId: string): PlayingFriend => ({
    steamId: String(76561198000000000n + BigInt(n)),
    publicId: n,
    displayName: `Amigo ${n}`,
    avatarUrl: null,
    serverId,
  });

  it('agrupa os amigos pelo servidor onde estão, na ordem recebida', () => {
    const a = '00000000-0000-4000-8000-00000000000a';
    const b = '00000000-0000-4000-8000-00000000000b';
    const grouped = friendsByServer([friend(1, a), friend(2, b), friend(3, a)]);
    expect(grouped.get(a)?.map((f) => f.publicId)).toEqual([1, 3]);
    expect(grouped.get(b)?.map((f) => f.publicId)).toEqual([2]);
    expect(grouped.get('00000000-0000-4000-8000-00000000000c')).toBeUndefined();
  });

  it('sem amigos, o mapa vem vazio', () => {
    expect(friendsByServer([]).size).toBe(0);
  });
});
