import { expect } from 'vitest';
import type { Browser } from './browser.js';
import type { FakeSteamOpenId } from './fake-steam-openid.js';

/**
 * O login Steam completo, como o navegador faz: a API manda para a Steam (falsa), ela aprova
 * `steamId` e volta ao callback, que abre a sessão no `browser`.
 */
export async function loginViaSteam(
  browser: Browser,
  openId: FakeSteamOpenId,
  steamId: string,
  returnTo = '/',
) {
  const start = await browser.get(`/api/auth/steam/login?returnTo=${encodeURIComponent(returnTo)}`);
  expect(start.statusCode, start.body).toBe(302);
  openId.steamId = steamId;
  const atSteam = await fetch(String(start.headers.location), { redirect: 'manual' });
  const callback = new URL(atSteam.headers.get('location') ?? '');
  return browser.get(`${callback.pathname}${callback.search}`);
}
