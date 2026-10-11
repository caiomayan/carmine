import 'reflect-metadata';
import { CSRF_HEADER } from '@carmine/contracts';
import cookie from '@fastify/cookie';
import { Controller, Delete, Get, Module, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { type StartedValkeyContainer, ValkeyContainer } from '@testcontainers/valkey';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthenticatedGuard, CurrentSession, SessionGuard } from '../src/auth/session.guard.js';
import { SESSION_COOKIE } from '../src/auth/session-cookies.js';
import { type Session, SessionStore } from '../src/auth/sessions.js';
import { VALKEY_COMMAND_TIMEOUT_MS } from '../src/valkey/valkey.module.js';
import { VALKEY_IMAGE } from './images.js';
import { Browser, setCookiesOf } from './support/browser.js';

const ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const IDLE_SECONDS = 2;
const ABSOLUTE_SECONDS = 4;

/** Rotas de mentira com o mesmo guard que as rotas reais da Conta vão usar (S04 em diante). */
@Controller('probe')
@UseGuards(AuthenticatedGuard)
class ProbeController {
  @Get()
  read(@CurrentSession() session: Session) {
    return { accountId: session.accountId };
  }

  @Post()
  create() {
    return { ok: true };
  }

  @Put()
  replace() {
    return { ok: true };
  }

  @Patch()
  update() {
    return { ok: true };
  }

  @Delete()
  remove() {
    return { ok: true };
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Sessão do site', () => {
  let valkeyContainer: StartedValkeyContainer;
  let valkey: Redis;
  let store: SessionStore;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    valkeyContainer = await new ValkeyContainer(VALKEY_IMAGE).start();
    // Como o cliente da API (ValkeyModule): falha rápido com o Valkey fora.
    valkey = new Redis(valkeyContainer.getConnectionUrl(), {
      maxRetriesPerRequest: 1,
      commandTimeout: VALKEY_COMMAND_TIMEOUT_MS,
    });
    valkey.on('error', () => {});
    store = new SessionStore(valkey, {
      idleTtlSeconds: IDLE_SECONDS,
      absoluteTtlSeconds: ABSOLUTE_SECONDS,
    });

    @Module({
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
    await valkeyContainer?.stop();
  });

  async function loggedIn(): Promise<{ browser: Browser; session: Session }> {
    const session = await store.create(ACCOUNT_ID);
    const browser = new Browser(app);
    browser.cookies.set(SESSION_COOKIE, session.id);
    return { browser, session };
  }

  it('reconhece a sessão do cookie', async () => {
    const { browser } = await loggedIn();

    const response = await browser.get('/probe');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accountId: ACCOUNT_ID });
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'toda mutação (%s) exige o token CSRF da sessão',
    async (method) => {
      const { browser, session } = await loggedIn();

      const without = await browser.request({ method, url: '/probe' });
      const withToken = await browser.request({
        method,
        url: '/probe',
        headers: { [CSRF_HEADER]: session.csrfToken },
      });

      expect(without.statusCode).toBe(403);
      expect(withToken.statusCode, withToken.body).toBeLessThan(300);
    },
  );

  it('o token CSRF de outra sessão não serve', async () => {
    const { browser } = await loggedIn();
    const other = await store.create(ACCOUNT_ID);

    const response = await browser.post('/probe', { [CSRF_HEADER]: other.csrfToken });

    expect(response.statusCode).toBe(403);
  });

  it('sem uso pelo tempo ocioso, a sessão expira: 401 e o cookie é apagado', async () => {
    const { browser } = await loggedIn();

    await sleep(IDLE_SECONDS * 1000 + 300);
    const response = await browser.get('/probe');

    expect(response.statusCode).toBe(401);
    expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
  });

  it('uma mutação com a sessão expirada responde 401 (não 403), para o web pedir novo login', async () => {
    const { browser, session } = await loggedIn();

    await sleep(IDLE_SECONDS * 1000 + 300);
    const response = await browser.post('/probe', { [CSRF_HEADER]: session.csrfToken });

    expect(response.statusCode).toBe(401);
  });

  it('em uso, a validade desliza (cookie regravado), até o limite absoluto desde o login', async () => {
    const { browser } = await loggedIn();
    const startedAt = Date.now();

    // Usando a cada 0,7 s: passa do tempo ocioso (2 s) sem expirar.
    let renewals = 0;
    while (Date.now() - startedAt < 3200) {
      await sleep(700);
      const response = await browser.get('/probe');
      expect(response.statusCode, `aos ${Date.now() - startedAt} ms`).toBe(200);
      const renewed = setCookiesOf(response).find((c) => c.name === SESSION_COOKIE);
      if (renewed) {
        renewals++;
        expect(Number(renewed.attributes['max-age'])).toBeGreaterThan(0);
      }
    }
    expect(renewals).toBeGreaterThan(0);

    // Mas nunca além de 4 s do login, mesmo em uso.
    await sleep(ABSOLUTE_SECONDS * 1000 - (Date.now() - startedAt) + 300);
    expect((await browser.get('/probe')).statusCode).toBe(401);
  });

  it('com o Valkey fora, responde 503 em vez de tratar a pessoa como deslogada', async () => {
    const { browser } = await loggedIn();

    await valkeyContainer.stop();
    const response = await browser.get('/probe');

    expect(response.statusCode).toBe(503);
    expect(browser.cookie(SESSION_COOKIE)).toBeDefined();
  });
});
