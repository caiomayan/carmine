import { type StartedValkeyContainer, ValkeyContainer } from '@testcontainers/valkey';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type RateLimitDecision, RateLimiter } from '../src/rate-limit/rate-limiter.js';
import { VALKEY_COMMAND_TIMEOUT_MS } from '../src/valkey/valkey.module.js';
import { VALKEY_IMAGE } from './images.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Como o cliente da API (ValkeyModule). */
function client(url: string): Redis {
  const redis = new Redis(url, {
    maxRetriesPerRequest: 1,
    commandTimeout: VALKEY_COMMAND_TIMEOUT_MS,
  });
  redis.on('error', () => {});
  return redis;
}

describe('RateLimiter (GCRA no Valkey)', () => {
  let container: StartedValkeyContainer;
  let valkey: Redis;
  let limiter: RateLimiter;
  let n = 0;
  /** Uma chave nova por teste: nenhum teste herda o balde de outro. */
  const key = () => `teste:${++n}`;

  beforeAll(async () => {
    container = await new ValkeyContainer(VALKEY_IMAGE).start();
    valkey = client(container.getConnectionUrl());
    await valkey.ping();
    limiter = new RateLimiter(valkey);
  });

  afterAll(async () => {
    valkey?.disconnect();
    await container?.stop();
  });

  it('deixa passar até o limite, contando o que resta, e recusa o seguinte com o Retry-After', async () => {
    const k = key();
    const decisions: RateLimitDecision[] = [];
    for (let i = 0; i < 6; i++) {
      decisions.push(await limiter.consume(k, { limit: 5, periodSeconds: 60 }));
    }

    expect(decisions.map((d) => d.outcome)).toEqual([
      'allowed',
      'allowed',
      'allowed',
      'allowed',
      'allowed',
      'denied',
    ]);
    expect(decisions.map((d) => (d.outcome === 'unavailable' ? null : d.remaining))).toEqual([
      4, 3, 2, 1, 0, 0,
    ]);
    // 5 por minuto: uma vaga nova a cada 12 s.
    expect(decisions[5]).toMatchObject({ outcome: 'denied', limit: 5, retryAfterSeconds: 12 });
    // O balde cheio de novo leva o minuto inteiro (arredondado para cima).
    expect(decisions[4]).toMatchObject({ outcome: 'allowed', resetSeconds: 60 });
  });

  it('cada chave tem o próprio balde', async () => {
    const [a, b] = [key(), key()];
    await limiter.consume(a, { limit: 1, periodSeconds: 60 });

    expect((await limiter.consume(a, { limit: 1, periodSeconds: 60 })).outcome).toBe('denied');
    expect((await limiter.consume(b, { limit: 1, periodSeconds: 60 })).outcome).toBe('allowed');
  });

  it('é atômico: sob requisições simultâneas de várias conexões, passa exatamente o limite', async () => {
    const k = key();
    const clients = Array.from({ length: 5 }, () => client(container.getConnectionUrl()));
    try {
      await Promise.all(clients.map((c) => c.ping()));
      const limiters = clients.map((c) => new RateLimiter(c));
      const decisions = await Promise.all(
        Array.from({ length: 60 }, (_, i) =>
          limiters[i % limiters.length]?.consume(k, { limit: 10, periodSeconds: 60 }),
        ),
      );

      expect(decisions.filter((d) => d?.outcome === 'allowed')).toHaveLength(10);
      expect(decisions.filter((d) => d?.outcome === 'denied')).toHaveLength(50);
    } finally {
      for (const c of clients) c.disconnect();
    }
  });

  it('esperar o Retry-After basta para passar de novo, e recusas não gastam vaga', async () => {
    const k = key();
    const quota = { limit: 2, periodSeconds: 1 };
    await limiter.consume(k, quota);
    await limiter.consume(k, quota);
    const denied = await limiter.consume(k, quota);
    // Insistir enquanto recusado não empurra a próxima vaga para mais longe.
    await limiter.consume(k, quota);
    await limiter.consume(k, quota);

    expect(denied).toMatchObject({ outcome: 'denied', retryAfterSeconds: 1 });
    await sleep(1000);
    expect((await limiter.consume(k, quota)).outcome).toBe('allowed');
  });

  it('repõe as vagas aos poucos, sem o pico de 2x da janela fixa', async () => {
    const k = key();
    const quota = { limit: 4, periodSeconds: 1 };
    for (let i = 0; i < 4; i++) await limiter.consume(k, quota);

    // Uma vaga a cada 250 ms: depois de ~300 ms há só uma, não as quatro.
    await sleep(300);
    const after = [await limiter.consume(k, quota), await limiter.consume(k, quota)];

    expect(after.map((d) => d.outcome)).toEqual(['allowed', 'denied']);
  });

  it('a chave expira sozinha quando o balde enche de novo', async () => {
    const k = key();
    await limiter.consume(k, { limit: 10, periodSeconds: 60 });

    const ttls = await Promise.all(
      (await valkey.keys(`carmine:rate-limit:${k}`)).map((stored) => valkey.pttl(stored)),
    );

    expect(ttls).toHaveLength(1);
    // Uma requisição de 10 por minuto: o balde volta a ficar cheio em 6 s.
    expect(ttls[0]).toBeGreaterThan(5000);
    expect(ttls[0]).toBeLessThanOrEqual(6000);
  });

  it('com o Valkey fora, responde "unavailable" na hora, sem esperar o timeout', async () => {
    const down = client('redis://127.0.0.1:1');
    try {
      const started = Date.now();
      const decision = await new RateLimiter(down).consume(key(), { limit: 5, periodSeconds: 60 });

      expect(decision).toEqual({ outcome: 'unavailable' });
      expect(Date.now() - started).toBeLessThan(200);
    } finally {
      down.disconnect();
    }
  });
});
