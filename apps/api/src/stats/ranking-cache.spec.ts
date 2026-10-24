import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { RankingCache } from './ranking-cache.js';

/** Só o que o cache usa do cliente: um Valkey de mentira, em memória e compartilhado. */
function fakeValkey(store = new Map<string, string>()) {
  const valkey = {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    },
    del: async (key: string) => (store.delete(key) ? 1 : 0),
  };
  return { valkey: valkey as unknown as Redis, store };
}

const ranking = { ranked: [], weeks: ['2026-10-19'] };

describe('RankingCache', () => {
  it('guarda e devolve o Ranking por Modo e semana', async () => {
    const { valkey } = fakeValkey();
    const cache = new RankingCache(valkey, 45);
    await cache.set('retake', '2026-10-19', ranking);
    expect(await cache.get('retake', '2026-10-19')).toEqual(ranking);
    expect(await cache.get('deathmatch', '2026-10-19')).toBeNull();
  });

  it('com TTL 0 não grava nem lê: ignora o que outra API deixou no mesmo Valkey', async () => {
    const shared = new Map<string, string>();
    const withCache = new RankingCache(fakeValkey(shared).valkey, 45);
    const withoutCache = new RankingCache(fakeValkey(shared).valkey, 0);

    await withCache.set('retake', '2026-10-19', ranking);
    expect(shared.size).toBe(1);
    expect(await withoutCache.get('retake', '2026-10-19')).toBeNull();

    await withoutCache.set('deathmatch', '2026-10-19', ranking);
    expect(shared.size).toBe(1);
  });

  it('a Staff invalida a entrada', async () => {
    const { valkey } = fakeValkey();
    const cache = new RankingCache(valkey, 45);
    await cache.set('retake', '2026-10-19', ranking);
    await cache.invalidate('retake', '2026-10-19');
    expect(await cache.get('retake', '2026-10-19')).toBeNull();
  });
});
