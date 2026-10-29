import { type CurrentSession, currentSessionSchema } from '@carmine/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { Browser } from './support/browser.js';
import { FakeSteamOpenId } from './support/fake-steam-openid.js';

const WEB = 'http://localhost:3000';
const STAFF = 'http://localhost:3100';
const SESSION_COOKIE = '__Host-carmine_session';
const FOUNDER = steamIdFor(9999);

/**
 * O login Steam do painel da Staff (S25, ADR 0015): outro realm (`PUBLIC_STAFF_URL`), a mesma Steam, uma sessão
 * `__Host-` por host, e só quem tem papel de Staff entra. O painel nunca cria Conta.
 */
describe('Login Steam do painel da Staff (S25)', () => {
  let t: TestApp;
  let openId: FakeSteamOpenId;
  let browser: Browser;

  beforeAll(async () => {
    openId = await FakeSteamOpenId.start();
    t = await startTestApp({
      PUBLIC_WEB_URL: WEB,
      PUBLIC_STAFF_URL: STAFF,
      STEAM_OPENID_URL: openId.endpoint,
    });
  });

  afterAll(async () => {
    await t?.stop();
    await openId?.stop();
  });

  beforeEach(() => {
    openId.behavior = 'ok';
    browser = new Browser(t.app);
  });

  /** Uma Conta que já jogou (existe), com ou sem papel de Staff. */
  async function account(n: number, role: 'owner' | 'admin' | 'moderator' | null) {
    const steamId = steamIdFor(n);
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName: `staff-${n}` },
    });
    expect(response.statusCode, response.body).toBe(200);
    const found = await t.accounts.findBySteamId(steamId);
    if (!found) throw new Error('Conta não nasceu');
    if (role) {
      await t.app
        .get(StaffRoles)
        .set(found.id, role, { actorSteamId: FOUNDER, reason: 'teste do painel' });
    }
    return { steamId, account: found };
  }

  /** O login do painel completo, como o navegador faz, até o callback. */
  async function staffLogin(steamId: string, returnTo = '/') {
    const start = await browser.get(
      `/api/auth/steam/staff/login?returnTo=${encodeURIComponent(returnTo)}`,
    );
    expect(start.statusCode, start.body).toBe(302);
    const atSteam = new URL(String(start.headers.location));
    expect(atSteam.searchParams.get('openid.realm')).toBe(STAFF);
    expect(atSteam.searchParams.get('openid.return_to')).toContain(
      `${STAFF}/api/auth/steam/staff/callback`,
    );
    openId.steamId = steamId;
    const toCallback = await fetch(String(start.headers.location), { redirect: 'manual' });
    const callback = new URL(toCallback.headers.get('location') ?? '');
    expect(callback.origin).toBe(STAFF);
    return browser.get(`${callback.pathname}${callback.search}`);
  }

  it('quem tem papel de Staff entra, volta à página de origem do painel e o /api/me traz o papel', async () => {
    const { steamId } = await account(1, 'moderator');

    const response = await staffLogin(steamId, '/denuncias');

    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toBe(`${STAFF}/denuncias`);
    expect(browser.cookie(SESSION_COOKIE)).toBeDefined();
    const me = await browser.get('/api/me');
    expect(me.statusCode, me.body).toBe(200);
    const session: CurrentSession = currentSessionSchema.parse(me.json());
    expect(session.staffRole).toBe('moderator');
  });

  it('uma Conta sem papel de Staff não abre sessão e volta para /entrar?erro=sem-acesso', async () => {
    const { steamId } = await account(2, null);

    const response = await staffLogin(steamId, '/fotos');

    expect(response.statusCode).toBe(303);
    const location = new URL(String(response.headers.location));
    expect(`${location.origin}${location.pathname}`).toBe(`${STAFF}/entrar`);
    expect(location.searchParams.get('erro')).toBe('sem-acesso');
    expect(location.searchParams.get('voltar')).toBe('/fotos');
    expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
  });

  it('um SteamID sem Conta não entra e o painel não cria a Conta', async () => {
    const steamId = steamIdFor(3);

    const response = await staffLogin(steamId);

    expect(new URL(String(response.headers.location)).searchParams.get('erro')).toBe('sem-acesso');
    expect(browser.cookie(SESSION_COOKIE)).toBeUndefined();
    expect(await t.accounts.findBySteamId(steamId)).toBeNull();
  });

  it('o login do site continua no realm do site, e o do painel não serve de callback do site', async () => {
    const start = await browser.get('/api/auth/steam/login');
    expect(start.statusCode).toBe(302);
    expect(new URL(String(start.headers.location)).searchParams.get('openid.realm')).toBe(WEB);
  });
});

describe('Login Steam do painel da Staff sem PUBLIC_STAFF_URL', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp({ PUBLIC_WEB_URL: WEB });
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('as duas rotas respondem 404', async () => {
    const browser = new Browser(t.app);
    expect((await browser.get('/api/auth/steam/staff/login')).statusCode).toBe(404);
    expect((await browser.get('/api/auth/steam/staff/callback')).statusCode).toBe(404);
  });
});
