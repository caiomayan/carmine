import { randomInt } from 'node:crypto';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

const FAKE_STEAM_HOST = '127.0.0.1';
/** Mesmos nomes de cookie da Steam falsa (apps/api/test/support/fake-steam-openid.ts). */
const FAKE_STEAM_ID_COOKIE = 'fake_steam_id';
const FAKE_STEAM_ACTION_COOKIE = 'fake_steam_action';

/** Um SteamID64 individual (até 76561202255233023) que nenhuma execução anterior usou, na prática. */
export function newSteamId(): string {
  return (76561198000000000n + BigInt(randomInt(1, 4_000_000_000))).toString();
}

/** Escolhe quem "entra" na Steam falsa neste navegador (e se a pessoa desiste lá). */
export async function chooseSteamAccount(
  context: BrowserContext,
  steamId: string,
  { cancel = false } = {},
) {
  const cookie = { domain: FAKE_STEAM_HOST, path: '/' };
  await context.addCookies([
    { ...cookie, name: FAKE_STEAM_ID_COOKIE, value: steamId },
    { ...cookie, name: FAKE_STEAM_ACTION_COOKIE, value: cancel ? 'cancel' : 'ok' },
  ]);
}

/** Uma Conta que jogou num Servidor Carmine e nunca entrou no site (não reivindicada). */
export async function createUnclaimedAccount(request: APIRequestContext, steamName: string) {
  const steamId = newSteamId();
  const response = await request.post('/api/server/player-connects', {
    headers: { authorization: `Bearer ${process.env.E2E_SERVER_KEY}` },
    data: { steamId, steamName },
  });
  if (!response.ok()) throw new Error(`connect recusado: ${response.status()}`);
  const { publicId, displayName } = (await response.json()) as {
    publicId: number;
    displayName: string;
  };
  return { steamId, publicId, displayName };
}

/** Entra pela interface: barra superior, página de entrar e Steam falsa. */
export async function signInFromHeader(page: Page, steamId: string) {
  await chooseSteamAccount(page.context(), steamId);
  await page.getByTestId('sign-in').click();
  await page.getByTestId('steam-login').click();
}
