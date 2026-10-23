import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { ActivityFeed } from './activity-feed.js';

const ACCOUNT = '00000000-0000-4000-8000-000000000001';
const SERVER = '00000000-0000-4000-8000-0000000000aa';
const NOW = new Date('2026-10-22T18:00:00.000Z');
const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

/** Um Valkey de mentira, só com o que o feed usa (`SET NX`, `DEL`, `LRANGE` e `MULTI`). */
class FakeValkey {
  readonly keys = new Map<string, string>();
  readonly list: string[] = [];
  failWrites = false;

  async set(key: string, value: string, ..._options: (string | number)[]): Promise<'OK' | null> {
    if (this.keys.has(key)) return null;
    this.keys.set(key, value);
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    return keys.filter((key) => this.keys.delete(key)).length;
  }

  async lrange(): Promise<string[]> {
    return [...this.list];
  }

  multi() {
    const steps: (() => void)[] = [];
    const chain = {
      lpush: (_key: string, value: string) => {
        steps.push(() => this.list.unshift(value));
        return chain;
      },
      ltrim: () => chain,
      expire: () => chain,
      exec: async () => {
        if (this.failWrites) throw new Error('Valkey fora');
        for (const step of steps) step();
        return [];
      },
    };
    return chain;
  }
}

function feedWith() {
  const valkey = new FakeValkey();
  const feed = new ActivityFeed(valkey as unknown as Redis, () => NOW);
  return { valkey, feed };
}

describe('ActivityFeed', () => {
  it('grava o acontecimento com um id e devolve do mais novo para o mais antigo', async () => {
    const { feed } = feedWith();

    await feed.joined(ACCOUNT, SERVER, secondsAgo(30));
    await feed.newLeader(ACCOUNT, 'retake', secondsAgo(5));

    const recent = await feed.recent();
    expect(recent.map((event) => event.type)).toEqual(['new_leader', 'joined']);
    expect(recent[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('um acontecimento atrasado pela fila do plugin (mais de 10 minutos) não entra', async () => {
    const { feed } = feedWith();

    await feed.joined(ACCOUNT, SERVER, secondsAgo(11 * 60));

    expect(await feed.recent()).toEqual([]);
  });

  describe('janelas de silêncio', () => {
    it('entrar de novo logo em seguida não repete', async () => {
      const { feed } = feedWith();

      await feed.joined(ACCOUNT, SERVER, secondsAgo(10));
      await feed.joined(ACCOUNT, SERVER, secondsAgo(5));

      expect(await feed.recent()).toHaveLength(1);
    });

    it('multi-kill: um por jogador por minuto', async () => {
      const { feed } = feedWith();

      await feed.multiKill(ACCOUNT, SERVER, 4, secondsAgo(20));
      await feed.multiKill(ACCOUNT, SERVER, 5, secondsAgo(2));
      await feed.multiKill('00000000-0000-4000-8000-000000000002', SERVER, 3, secondsAgo(1));

      expect((await feed.recent()).map((event) => event.type)).toEqual([
        'multi_kill',
        'multi_kill',
      ]);
    });

    it('a troca do primeiro lugar de um Modo é anunciada no máximo a cada 2 minutos', async () => {
      const { feed } = feedWith();

      await feed.newLeader(ACCOUNT, 'retake', secondsAgo(10));
      await feed.newLeader('00000000-0000-4000-8000-000000000002', 'retake', secondsAgo(5));
      await feed.newLeader('00000000-0000-4000-8000-000000000002', 'deathmatch', secondsAgo(5));

      expect(await feed.recent()).toHaveLength(2);
    });

    it('a janela bloqueada por outra devolve a que já tinha tomado', async () => {
      const { feed, valkey } = feedWith();
      await feed.skinEquipped(ACCOUNT, 222, secondsAgo(3));
      // A janela "por Conta" (1 min) passou; a "mesma skin" (1 h) segue valendo.
      valkey.keys.delete(`activity:throttle:equip:${ACCOUNT}`);

      await feed.skinEquipped(ACCOUNT, 222, secondsAgo(2));

      expect(await feed.recent()).toHaveLength(1);
      // A primeira janela foi tomada e devolvida: outra skin logo em seguida passa.
      expect(valkey.keys.has(`activity:throttle:equip:${ACCOUNT}`)).toBe(false);
      await feed.skinEquipped(ACCOUNT, 306, secondsAgo(1));
      expect(await feed.recent()).toHaveLength(2);
    });

    it('se a gravação falha, as janelas voltam e a próxima tentativa passa', async () => {
      const { feed, valkey } = feedWith();
      valkey.failWrites = true;

      await feed.joined(ACCOUNT, SERVER, secondsAgo(2));
      expect(await feed.recent()).toEqual([]);

      valkey.failWrites = false;
      await feed.joined(ACCOUNT, SERVER, secondsAgo(1));
      expect(await feed.recent()).toHaveLength(1);
    });
  });

  it('data inválida não lança nem grava', async () => {
    const { feed } = feedWith();

    await expect(feed.joined(ACCOUNT, SERVER, new Date('não é data'))).resolves.toBeUndefined();

    expect(await feed.recent()).toEqual([]);
  });

  it('com o Valkey fora, ler devolve vazio e gravar não lança', async () => {
    const broken = {
      lrange: async () => {
        throw new Error('fora');
      },
      set: async () => {
        throw new Error('fora');
      },
      del: async () => 0,
    };
    const feed = new ActivityFeed(broken as unknown as Redis, () => NOW);

    await expect(feed.joined(ACCOUNT, SERVER, secondsAgo(1))).resolves.toBeUndefined();
    expect(await feed.recent()).toEqual([]);
  });
});
