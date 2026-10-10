import {
  CSRF_COOKIE,
  CSRF_HEADER,
  type CurrentSession,
  currentSessionSchema,
} from '@carmine/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { Browser, setCookiesOf } from './support/browser.js';
import { FakeSteam } from './support/fake-steam.js';
import { FakeSteamOpenId } from './support/fake-steam-openid.js';
import { loginViaSteam as login } from './support/steam-login.js';

const WEB = 'http://localhost:3000';
const SESSION_COOKIE = '__Host-carmine_session';

describe('Login Steam (OpenID 2.0)', () => {
  let t: TestApp;
  let openId: FakeSteamOpenId;
  let webApi: FakeSteam;
  let browser: Browser;

  beforeAll(async () => {
    [openId, webApi] = await Promise.all([FakeSteamOpenId.start(), FakeSteam.start()]);
    t = await startTestApp({
      PUBLIC_WEB_URL: WEB,
      STEAM_OPENID_URL: openId.endpoint,
      STEAM_WEB_API_KEY: 'chave-de-teste',
      STEAM_WEB_API_URL: webApi.url,
    });
  });

  afterAll(async () => {
    await t?.stop();
    await Promise.all([openId?.stop(), webApi?.stop()]);
  });

  beforeEach(() => {
    openId.behavior = 'ok';
    webApi.behavior = 'ok';
    browser = new Browser(t.app);
  });

  /** Começa o login como o web faz e devolve a URL da Steam. */
  async function startLogin(returnTo = '/'): Promise<URL> {
    const start = await browser.get(
      `/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`,
    );
    expect(start.statusCode, start.body).toBe(302);
    return new URL(String(start.headers.location));
  }

  /** O `return_to` que a API pediu à Steam (o callback com o `state`). */
  function returnToOf(steamUrl: URL): string {
    return steamUrl.searchParams.get('openid.return_to') ?? '';
  }

  /** Volta da Steam para o callback, como o navegador faz. */
  function callback(url: string) {
    const parsed = new URL(url);
    expect(parsed.origin).toBe(WEB);
    return browser.get(`${parsed.pathname}${parsed.search}`);
  }

  function loginViaSteam(steamId: string, returnTo = '/') {
    return login(browser, openId, steamId, returnTo);
  }

  async function me(): Promise<CurrentSession> {
    const response = await browser.get('/api/me');
    expect(response.statusCode, response.body).toBe(200);
    return currentSessionSchema.parse(response.json());
  }

  async function connect(steamId: string, steamName = 'coldzera') {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName },
    });
    expect(response.statusCode, response.body).toBe(200);
    return response.json<{ publicId: number; isFirstConnect: boolean }>();
  }

  function expectLoginError(response: Awaited<ReturnType<typeof callback>>, error: string) {
    expect(response.statusCode).toBe(303);
    const location = new URL(String(response.headers.location));
    expect(`${location.origin}${location.pathname}`).toBe(`${WEB}/entrar`);
    expect(location.searchParams.get('erro')).toBe(error);
    expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
  }

  describe('reivindicação', () => {
    it('quem jogou antes e faz login vê a mesma Conta, com o mesmo ID público, agora reivindicada', async () => {
      const steamId = steamIdFor(1);
      const { publicId } = await connect(steamId);

      const response = await loginViaSteam(steamId, '/inventario');

      expect(response.statusCode).toBe(303);
      expect(response.headers.location).toBe(`${WEB}/inventario`);
      expect((await me()).account).toMatchObject({
        publicId,
        steamId,
        displayName: 'coldzera',
        claimed: true,
      });
    });

    it('quem nunca jogou ganha uma Conta já reivindicada, com nome e avatar da Steam', async () => {
      const steamId = steamIdFor(2);

      await loginViaSteam(steamId);

      const { account } = await me();
      expect(account).toMatchObject({
        steamId,
        claimed: true,
        displayName: FakeSteam.personaNameFor(steamId),
        avatarUrl: FakeSteam.avatarUrlFor(steamId),
        steamProfileUrl: `https://steamcommunity.com/profiles/${steamId}`,
      });
      expect(account.publicId).toBeGreaterThanOrEqual(10_000);

      // Ao entrar num Servidor Carmine depois, é a mesma Conta, com as boas-vindas do 1º connect.
      expect(await connect(steamId, 'novo no jogo')).toMatchObject({
        publicId: account.publicId,
        isFirstConnect: true,
      });
    });

    it('sem resposta da Steam Web API, a Conta nova nasce como "Jogador #ID" e avatar neutro', async () => {
      const steamId = steamIdFor(3);
      webApi.behavior = 'error';

      await loginViaSteam(steamId);

      const { account } = await me();
      expect(account.displayName).toBe(`Jogador #${account.publicId}`);
      expect(account.avatarUrl).toBeNull();
    });

    it('logar de novo não muda a Conta nem a data da reivindicação', async () => {
      const steamId = steamIdFor(4);
      await loginViaSteam(steamId);
      const claimedAt = (await t.accounts.findBySteamId(steamId))?.claimedAt;

      await loginViaSteam(steamId);

      expect((await t.accounts.findBySteamId(steamId))?.claimedAt).toEqual(claimedAt);
    });
  });

  describe('sessão', () => {
    it('vai num cookie httpOnly, Secure e SameSite=Lax; o token CSRF num cookie legível', async () => {
      const steamUrl = await startLogin();
      openId.steamId = steamIdFor(10);
      const atSteam = await fetch(steamUrl, { redirect: 'manual' });
      const location = new URL(atSteam.headers.get('location') ?? '');

      const response = await browser.get(`${location.pathname}${location.search}`);

      const cookies = Object.fromEntries(setCookiesOf(response).map((c) => [c.name, c]));
      expect(cookies[SESSION_COOKIE]?.attributes).toMatchObject({
        httponly: true,
        secure: true,
        samesite: 'Lax',
        path: '/',
      });
      expect(cookies[SESSION_COOKIE]?.value).toMatch(/^[\w-]{43}$/);
      expect(cookies[CSRF_COOKIE]?.attributes).toMatchObject({ secure: true, samesite: 'Lax' });
      expect(cookies[CSRF_COOKIE]?.attributes.httponly).toBeUndefined();
      expect(cookies[CSRF_COOKIE]?.value).toBe((await me()).csrfToken);
    });

    it('é rotacionada no login: a sessão de antes deixa de valer', async () => {
      await loginViaSteam(steamIdFor(11));
      const before = browser.cookie(SESSION_COOKIE);

      await loginViaSteam(steamIdFor(11));

      const after = browser.cookie(SESSION_COOKIE);
      expect(after).toBeDefined();
      expect(after).not.toBe(before);
      const old = await t.app.inject({
        url: '/api/me',
        headers: { cookie: `${SESSION_COOKIE}=${before}` },
      });
      expect(old.statusCode).toBe(401);
    });

    it('sem sessão, GET /api/me responde 401', async () => {
      expect((await browser.get('/api/me')).statusCode).toBe(401);
    });

    it('um cookie de sessão inventado responde 401 e é apagado', async () => {
      browser.cookies.set(SESSION_COOKIE, 'a'.repeat(43));

      const response = await browser.get('/api/me');

      expect(response.statusCode).toBe(401);
      expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
    });
  });

  describe('logout e CSRF', () => {
    it('logout sem token CSRF é recusado (403) e a sessão continua', async () => {
      await loginViaSteam(steamIdFor(20));

      const response = await browser.post('/api/auth/logout');

      expect(response.statusCode).toBe(403);
      await me();
    });

    it('logout com um token CSRF errado é recusado (403)', async () => {
      await loginViaSteam(steamIdFor(21));

      const response = await browser.post('/api/auth/logout', { [CSRF_HEADER]: 'x'.repeat(43) });

      expect(response.statusCode).toBe(403);
      await me();
    });

    it('logout vindo de outro site é recusado mesmo com o token', async () => {
      await loginViaSteam(steamIdFor(22));
      const { csrfToken } = await me();

      const response = await browser.post('/api/auth/logout', {
        [CSRF_HEADER]: csrfToken,
        'sec-fetch-site': 'cross-site',
      });

      expect(response.statusCode).toBe(403);
    });

    it('logout com o token encerra a sessão no servidor: o cookie antigo não vale mais', async () => {
      await loginViaSteam(steamIdFor(23));
      const sessionId = browser.cookie(SESSION_COOKIE);
      const csrfToken = browser.cookie(CSRF_COOKIE) ?? '';

      const response = await browser.post('/api/auth/logout', {
        [CSRF_HEADER]: csrfToken,
        'sec-fetch-site': 'same-origin',
      });

      expect(response.statusCode).toBe(204);
      expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
      expect(browser.cookie(CSRF_COOKIE)).toBeUndefined();
      const replayed = await t.app.inject({
        url: '/api/me',
        headers: { cookie: `${SESSION_COOKIE}=${sessionId}` },
      });
      expect(replayed.statusCode).toBe(401);
    });

    it('as rotas dos Servidores Carmine (chave no Authorization) não pedem CSRF', async () => {
      expect((await connect(steamIdFor(24))).publicId).toBeGreaterThan(0);
    });
  });

  describe('volta para a página de origem', () => {
    it.each([
      ['https://evil.example/roubar'],
      ['//evil.example'],
      ['/\\evil.example'],
      ['/..//evil.example'],
    ])('um returnTo externo (%s) vira a home', async (returnTo) => {
      const response = await loginViaSteam(steamIdFor(30), returnTo);

      expect(response.statusCode).toBe(303);
      expect(response.headers.location).toBe(`${WEB}/`);
    });

    it('a página de origem fica no servidor: mexer no state do return_to não a troca', async () => {
      const steamUrl = await startLogin('/inventario');

      // O state é o que amarra a volta ao navegador; um state de outro fluxo não é aceito.
      const forged = new URL(returnToOf(steamUrl));
      forged.searchParams.set('state', 'outro-state');
      const response = await callback(
        openId.positiveAssertionUrl(forged.toString(), { steamId: steamIdFor(31) }),
      );

      expectLoginError(response, 'invalido');
    });
  });

  describe('asserções recusadas', () => {
    it('asserção adulterada depois de assinada (outro SteamID)', async () => {
      const victim = steamIdFor(40);
      const steamUrl = await startLogin();
      const returnTo = returnToOf(steamUrl);
      const claimed = `https://steamcommunity.com/openid/id/${victim}`;

      const response = await callback(
        openId.positiveAssertionUrl(returnTo, {
          steamId: steamIdFor(41),
          overrides: { claimed_id: claimed, identity: claimed },
        }),
      );

      expectLoginError(response, 'invalido');
      expect(await t.accounts.findBySteamId(victim)).toBeNull();
    });

    it('assinatura que não confere', async () => {
      const steamUrl = await startLogin();

      const response = await callback(
        openId.positiveAssertionUrl(returnToOf(steamUrl), {
          steamId: steamIdFor(42),
          overrides: { sig: Buffer.alloc(32).toString('base64') },
        }),
      );

      expectLoginError(response, 'invalido');
    });

    it('a mesma URL de volta usada duas vezes (replay)', async () => {
      const steamUrl = await startLogin();
      const back = openId.positiveAssertionUrl(returnToOf(steamUrl), { steamId: steamIdFor(43) });
      const loginState = browser.cookie('carmine_login') ?? '';
      expect((await callback(back)).headers.location).toBe(`${WEB}/`);

      browser.cookies.clear();
      browser.cookies.set('carmine_login', loginState);
      expectLoginError(await callback(back), 'invalido');
    });

    it('nonce repetido, mesmo num fluxo de login novo e com assinatura válida', async () => {
      const nonce = FakeSteamOpenId.nonce();
      const first = await startLogin();
      await callback(
        openId.positiveAssertionUrl(returnToOf(first), { steamId: steamIdFor(44), nonce }),
      );
      expect(browser.cookie(SESSION_COOKIE)).toBeDefined();

      browser = new Browser(t.app);
      const second = await startLogin();
      const response = await callback(
        openId.positiveAssertionUrl(returnToOf(second), { steamId: steamIdFor(44), nonce }),
      );

      expectLoginError(response, 'invalido');
    });

    it('return_to de outro site, mesmo assinado pela Steam', async () => {
      const steamUrl = await startLogin();
      const ours = new URL(returnToOf(steamUrl));
      const foreign = `https://evil.example/api/auth/steam/callback${ours.search}`;

      const response = await callback(
        openId.positiveAssertionUrl(returnToOf(steamUrl), {
          steamId: steamIdFor(45),
          sign: { return_to: foreign },
        }),
      );

      expectLoginError(response, 'invalido');
    });

    it('asserção de outro provedor OpenID (op_endpoint)', async () => {
      const steamUrl = await startLogin();

      const response = await callback(
        openId.positiveAssertionUrl(returnToOf(steamUrl), {
          steamId: steamIdFor(46),
          sign: { op_endpoint: 'https://evil.example/openid/login' },
        }),
      );

      expectLoginError(response, 'invalido');
    });

    it.each([
      ['http://steamcommunity.com/openid/id/76561198000000047', 'http'],
      ['https://steamcommunity.com.evil.example/openid/id/76561198000000047', 'outro host'],
      ['https://steamcommunity.com/openid/id/123', 'SteamID curto'],
      ['https://steamcommunity.com/openid/id/76561197960265728', 'fora da faixa individual'],
    ])('claimed_id fora do formato da Steam (%s, %s)', async (claimedId) => {
      const steamUrl = await startLogin();

      const response = await callback(
        openId.positiveAssertionUrl(returnToOf(steamUrl), {
          sign: { claimed_id: claimedId, identity: claimedId },
        }),
      );

      expectLoginError(response, 'invalido');
    });

    it('asserção velha (nonce de 10 minutos atrás)', async () => {
      const steamUrl = await startLogin();

      const response = await callback(
        openId.positiveAssertionUrl(returnToOf(steamUrl), {
          steamId: steamIdFor(48),
          nonce: FakeSteamOpenId.nonce(new Date(Date.now() - 10 * 60 * 1000)),
        }),
      );

      expectLoginError(response, 'invalido');
    });

    it('volta da Steam sem o cookie do fluxo (login CSRF)', async () => {
      const steamUrl = await startLogin();
      browser.cookies.delete('carmine_login');

      const response = await callback(
        openId.positiveAssertionUrl(returnToOf(steamUrl), { steamId: steamIdFor(49) }),
      );

      expectLoginError(response, 'invalido');
    });
  });

  describe('falhas', () => {
    it('a pessoa desistiu na Steam: volta com erro "cancelado" e a página de origem', async () => {
      const steamUrl = await startLogin('/inventario');
      const back = new URL(returnToOf(steamUrl));
      back.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
      back.searchParams.set('openid.mode', 'cancel');

      const response = await callback(back.toString());

      expectLoginError(response, 'cancelado');
      expect(new URL(String(response.headers.location)).searchParams.get('voltar')).toBe(
        '/inventario',
      );
    });

    it('a Steam não confirma a asserção (fora do ar): erro "indisponivel" e nenhuma Conta', async () => {
      const steamId = steamIdFor(50);
      openId.behavior = 'error';

      const response = await loginViaSteam(steamId);

      expectLoginError(response, 'indisponivel');
      expect(await t.accounts.findBySteamId(steamId)).toBeNull();
    });

    it('a verificação vai sempre ao endpoint configurado, com mode=check_authentication', async () => {
      const before = openId.verifications.length;

      await loginViaSteam(steamIdFor(51));

      const sent = openId.verifications.slice(before);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.get('openid.mode')).toBe('check_authentication');
    });
  });
});
