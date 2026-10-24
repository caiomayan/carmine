import { describe, expect, it } from 'vitest';
import { featuredServer, homeState, orderedServers, totalPlayers } from './state';

const base = { listLoaded: true, connecting: false, liveCount: 2, signedIn: true, friendsNow: 0 };

describe('homeState', () => {
  it('sem lista: carregando enquanto conecta, indisponível quando desistiu', () => {
    expect(homeState({ ...base, listLoaded: false, connecting: true })).toBe('carregando');
    expect(homeState({ ...base, listLoaded: false, connecting: false })).toBe('indisponivel');
  });

  it('nenhum servidor no ar é "offline", logado ou não', () => {
    expect(homeState({ ...base, liveCount: 0 })).toBe('offline');
    expect(homeState({ ...base, liveCount: 0, signedIn: false })).toBe('offline');
  });

  it('deslogado com servidores no ar', () => {
    expect(homeState({ ...base, signedIn: false, friendsNow: 3 })).toBe('deslogado');
  });

  it('logado: com amigos jogando é "amigos", sem eles é "sem-nada"', () => {
    expect(homeState({ ...base, friendsNow: 1 })).toBe('amigos');
    expect(homeState({ ...base, friendsNow: 0 })).toBe('sem-nada');
  });
});

const server = (state: 'online' | 'full' | 'offline', players: number) => ({ state, players });

describe('os servidores da Home', () => {
  it('o destaque é o mais cheio entre os no ar; offline nunca', () => {
    const list = [
      server('offline', 0),
      server('online', 3),
      server('full', 9),
      server('online', 9),
    ];
    expect(featuredServer(list)).toBe(list[2]);
    expect(featuredServer([server('offline', 0)])).toBeNull();
    expect(featuredServer([])).toBeNull();
  });

  it('o total só soma os que estão no ar', () => {
    expect(totalPlayers([server('online', 3), server('offline', 5), server('full', 9)])).toBe(12);
  });

  it('os no ar vêm primeiro, cada grupo na ordem da API', () => {
    const list = [
      { id: 'a', state: 'offline' as const },
      { id: 'b', state: 'online' as const },
      { id: 'c', state: 'offline' as const },
      { id: 'd', state: 'full' as const },
    ];
    expect(orderedServers(list).map((s) => s.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});
