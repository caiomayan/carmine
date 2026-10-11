import 'reflect-metadata';
import { CSRF_HEADER } from '@carmine/contracts';
import cookie from '@fastify/cookie';
import { Controller, Module, Post } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { type StartedValkeyContainer, ValkeyContainer } from '@testcontainers/valkey';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionGuard } from '../src/auth/session.guard.js';
import { SESSION_COOKIE } from '../src/auth/session-cookies.js';
import { type Session, SessionStore } from '../src/auth/sessions.js';
import { ClientIpModule } from '../src/client-ip/client-ip.module.js';
import { AppConfigModule } from '../src/config/app-config.module.js';
import { loadConfig } from '../src/config/config.js';
import { RateLimit } from '../src/rate-limit/rate-limit.decorator.js';
import { RateLimitModule } from '../src/rate-limit/rate-limit.module.js';
import { VALKEY, VALKEY_COMMAND_TIMEOUT_MS } from '../src/valkey/valkey.module.js';
import { VALKEY_IMAGE } from './images.js';

/** Uma mutação de mentira com a política que as mutações reais da Conta usam (S04 em diante). */
@Controller('probe')
class ProbeController {
  @Post()
  @RateLimit('mutations')
  mutate() {
    return { ok: true };
  }
}

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';

describe('Rate limit por sessão nas mutações', () => {
  let container: StartedValkeyContainer;
  let valkey: Redis;
  let store: SessionStore;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    container = await new ValkeyContainer(VALKEY_IMAGE).start();
    valkey = new Redis(container.getConnectionUrl(), {
      maxRetriesPerRequest: 1,
      commandTimeout: VALKEY_COMMAND_TIMEOUT_MS,
    });
    valkey.on('error', () => {});
    await valkey.ping();
    store = new SessionStore(valkey, { idleTtlSeconds: 3600, absoluteTtlSeconds: 7200 });
    const config = loadConfig({
      DATABASE_URL: 'postgres://nao-usado:5432/x',
      VALKEY_URL: container.getConnectionUrl(),
      RATE_LIMIT_MUTATIONS_PER_MINUTE: '2',
    });

    @Module({ providers: [{ provide: VALKEY, useValue: valkey }], exports: [VALKEY] })
    class TestValkeyModule {}

    @Module({
      imports: [
        AppConfigModule.forRoot(config),
        { module: TestValkeyModule, global: true },
        ClientIpModule,
        RateLimitModule,
      ],
      controllers: [ProbeController],
      providers: [
        { provide: SessionStore, useValue: store },
        { provide: APP_GUARD, useClass: SessionGuard },
      ],
    })
    class ProbeModule {}

    app = await NestFactory.create<NestFastifyApplication>(ProbeModule, new FastifyAdapter(), {
      logger: false,
    });
    await app.register(cookie);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
    valkey?.disconnect();
    // O último teste já parou o Valkey.
    await container?.stop().catch(() => {});
  });

  const mutate = (session: Session | null, remoteAddress = '198.51.100.1') =>
    app.inject({
      method: 'POST',
      url: '/probe',
      remoteAddress,
      headers: session
        ? { cookie: `${SESSION_COOKIE}=${session.id}`, [CSRF_HEADER]: session.csrfToken }
        : {},
    });

  it('cada sessão tem o próprio limite, mesmo atrás do mesmo IP', async () => {
    const [first, second] = [await store.create(ACCOUNT_ID), await store.create(ACCOUNT_ID)];

    const results = [await mutate(first), await mutate(first), await mutate(first)];

    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 429]);
    expect(results[0]?.headers['ratelimit-policy']).toBe('"mutations";q=2;w=60');
    expect(results[2]?.headers['retry-after']).toBe('30');
    expect((await mutate(second)).statusCode).toBe(201);
  });

  it('trocar de IP não renova o limite da sessão', async () => {
    const session = await store.create(ACCOUNT_ID);
    await mutate(session, '198.51.100.10');
    await mutate(session, '198.51.100.11');

    expect((await mutate(session, '198.51.100.12')).statusCode).toBe(429);
  });

  it('sem sessão, conta pelo IP', async () => {
    const results = [
      await mutate(null, '198.51.100.20'),
      await mutate(null, '198.51.100.20'),
      await mutate(null, '198.51.100.20'),
      await mutate(null, '198.51.100.21'),
    ];

    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 429, 201]);
  });

  it('com o Valkey fora, a mutação fica fechada (503)', async () => {
    await container.stop();

    expect((await mutate(null, '198.51.100.30')).statusCode).toBe(503);
  });
});
