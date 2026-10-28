import type { LiveServer, LiveServerList, PlayingFriend } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import {
  type FriendsView,
  friendsByServer,
  friendsWithServers,
  initialLive,
  liveReducer,
  nextFriends,
  occupancy,
  offlineGroupOpen,
  sameVisibleList,
  serverAnchor,
  serverFullLabel,
  serverHref,
  serverLabel,
  steamConnectUrl,
  updatedSecondsAgo,
  viewFriends,
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
  lastMap: 'de_mirage',
  ...over,
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

  it('um evento que não muda nada visível devolve o MESMO estado (sem renderizar a lista de novo)', () => {
    const live = liveReducer(initialLive(null), {
      type: 'snapshot',
      list: list('2026-10-12T12:00:00Z', 4),
      at: T0,
    });
    // Só o generatedAt e o horário do batimento mudam: o que a API não considera uma mudança.
    const again = list('2026-10-12T12:00:10Z', 4);
    again.servers = again.servers.map((s) => ({ ...s, lastHeartbeatAt: '2026-10-12T12:00:09Z' }));
    expect(liveReducer(live, { type: 'snapshot', list: again, at: T0 + 10_000 })).toBe(live);
    // Mudou um jogador: estado novo.
    const changed = liveReducer(live, {
      type: 'snapshot',
      list: list('2026-10-12T12:00:10Z', 5),
      at: T0 + 10_000,
    });
    expect(changed).not.toBe(live);
    expect(changed.list?.summary.players).toBe(5);
    // Voltando de uma queda, o mesmo conteúdo ainda confirma a conexão (estado novo, ao vivo).
    const lost = liveReducer(live, { type: 'lost', at: T0 + 20_000 });
    const back = liveReducer(lost, { type: 'snapshot', list: again, at: T0 + 30_000 });
    expect(back.connection).toBe('live');
  });

  it('sameVisibleList ignora o horário do batimento e o generatedAt, mas vê mapa, jogadores e estado', () => {
    const a = list('2026-10-12T12:00:00Z', 4);
    const b = { ...a, generatedAt: '2026-10-12T12:09:00Z' };
    expect(sameVisibleList(a, b)).toBe(true);
    expect(sameVisibleList(a, { ...a, servers: [server({ players: 4, map: 'de_inferno' })] })).toBe(
      false,
    );
    expect(sameVisibleList(a, { ...a, servers: [server({ players: 4, state: 'full' })] })).toBe(
      false,
    );
    expect(sameVisibleList(a, { ...a, servers: [] })).toBe(false);
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
    expect(nextFriends({ status: 'loading' }, { status: 'private', friends: [] })).toEqual({
      status: 'private',
      friends: [],
      stale: false,
    });
    expect(nextFriends({ status: 'loading' }, { status: 'private', friends: ok.friends })).toEqual({
      status: 'private',
      friends: ok.friends,
      stale: false,
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

  it('a lista privada com amigos achados também fica, marcada como antiga, se a Steam falha', () => {
    const found: FriendsView = { status: 'private', friends: ok.friends, stale: false };

    expect(nextFriends(found, { status: 'unavailable' })).toEqual({ ...found, stale: true });
  });

  it('privada sem ninguém achado não guarda nada para mostrar como antigo', () => {
    const none: FriendsView = { status: 'private', friends: [], stale: false };

    expect(nextFriends(none, 'failed')).toEqual({ status: 'unavailable' });
  });

  it('os amigos do estado: da lista própria ou achados pelas listas deles', () => {
    expect(viewFriends(ok)).toEqual(ok.friends);
    expect(viewFriends({ status: 'private', friends: ok.friends, stale: false })).toEqual(
      ok.friends,
    );
    expect(viewFriends({ status: 'loading' })).toEqual([]);
    expect(viewFriends({ status: 'unavailable' })).toEqual([]);
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

describe('âncora do cartão do servidor', () => {
  it('o id do cartão vem do id do servidor, e o link leva até ele', () => {
    const live = server({ id: '0b9b1f2e-0000-4000-8000-000000000001', state: 'online' });

    expect(serverAnchor(live.id)).toBe('servidor-0b9b1f2e-0000-4000-8000-000000000001');
    expect(serverHref(live)).toBe('/#servidor-0b9b1f2e-0000-4000-8000-000000000001');
  });

  it('lotado também tem cartão; offline fica no grupo recolhido, então o link só leva à home', () => {
    expect(serverHref(server({ state: 'full' }))).toMatch(/^\/#servidor-/);
    expect(serverHref(server({ state: 'offline' }))).toBe('/');
  });
});
