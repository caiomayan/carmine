import { randomInt } from 'node:crypto';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { runApiCli } from './api-cli';

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

/** O jogo conecta um jogador num Servidor Carmine: a Conta nasce (ou é a mesma de antes). */
export async function reconnectPlayer(
  request: APIRequestContext,
  steamId: string,
  steamName: string,
) {
  const response = await request.post('/api/server/player-connects', {
    headers: { authorization: `Bearer ${process.env.E2E_SERVER_KEY}` },
    data: { steamId, steamName },
  });
  if (!response.ok()) throw new Error(`connect recusado: ${response.status()}`);
  return (await response.json()) as { publicId: number; displayName: string };
}

/** Uma Conta que jogou num Servidor Carmine e nunca entrou no site (não reivindicada). */
export async function createUnclaimedAccount(request: APIRequestContext, steamName: string) {
  const steamId = newSteamId();
  const { publicId, displayName } = await reconnectPlayer(request, steamId, steamName);
  return { steamId, publicId, displayName };
}

/** Entra pela interface: barra superior, página de entrar e Steam falsa. */
export async function signInFromHeader(page: Page, steamId: string) {
  await chooseSteamAccount(page.context(), steamId);
  await page.getByTestId('sign-in').click();
  await page.getByTestId('steam-login').click();
}

/**
 * Entra pelo mesmo caminho do botão (API, Steam falsa e callback), mas só com requisições: a
 * sessão cai nos cookies do navegador sem as três navegações da interface. Para os testes que
 * precisam de uma Conta logada de partida; o fluxo pela interface fica em `signInFromHeader`.
 */
export async function signInByRequest(page: Page, steamId: string) {
  await chooseSteamAccount(page.context(), steamId);
  const response = await page.request.get('/api/auth/steam/login?returnTo=%2F');
  if (!response.ok()) throw new Error(`login recusado: ${response.status()}`);
}

/** SteamID64 da "Staff" que assina as concessões de VIP dos E2E no log de auditoria. */
const E2E_STAFF_STEAM_ID = '76561197960265729';

/**
 * Concede um Período VIP pelo CLI de operação da API, como a Staff (com registro no log de
 * auditoria). A Conta precisa existir: entre com a Steam falsa antes.
 */
export function grantVip(steamId: string, days = 1) {
  runApiCli('dist/vip/vip.cli.js', [
    'grant',
    '--steam-id',
    steamId,
    '--days',
    String(days),
    '--by',
    E2E_STAFF_STEAM_ID,
    '--reason',
    'E2E',
  ]);
}

/** O token CSRF da sessão deste navegador, para mutações feitas direto na API. */
export async function csrfToken(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((c) => c.name === 'carmine_csrf');
  if (!cookie) throw new Error('sem cookie CSRF: a sessão não começou');
  return decodeURIComponent(cookie.value);
}

/** Revoga o Período VIP pelo CLI de operação da API, como a Staff (com registro no log de auditoria). */
export function revokeVip(steamId: string) {
  runApiCli('dist/vip/vip.cli.js', [
    'revoke',
    '--steam-id',
    steamId,
    '--by',
    E2E_STAFF_STEAM_ID,
    '--reason',
    'E2E',
  ]);
}

/**
 * Dá um papel de Staff pelo CLI de operação da API (S07), como o dono faz. A Conta precisa
 * existir e estar reivindicada: entre com a Steam falsa antes.
 */
export function grantStaffRole(steamId: string, role: 'owner' | 'admin' | 'moderator') {
  runApiCli('dist/staff/staff.cli.js', [
    'grant',
    '--steam-id',
    steamId,
    '--role',
    role,
    '--by',
    E2E_STAFF_STEAM_ID,
    '--reason',
    'E2E',
  ]);
}
