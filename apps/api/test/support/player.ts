import { CSRF_HEADER, type Cs2Item, inventoryItemSchema } from '@carmine/contracts';
import { SESSION_COOKIE } from '../../src/auth/session-cookies.js';
import { SessionStore } from '../../src/auth/sessions.js';
import { vipPeriods } from '../../src/database/schema.js';
import { steamIdFor, type TestApp } from './app.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Uma Conta reivindicada com sessão aberta e as chamadas dela à API (com o token CSRF). Com
 * `vipUntil`, ganha um Período VIP que começou ontem e acaba nesse instante (ms).
 */
export async function signedInPlayer(t: TestApp, n: number, options: { vipUntil?: number } = {}) {
  const steamId = steamIdFor(n);
  const { account } = await t.accounts.claimOnLogin(steamId);
  if (options.vipUntil !== undefined) {
    await t.postgres.db.insert(vipPeriods).values({
      accountId: account.id,
      startsAt: new Date(Date.now() - DAY_MS),
      endsAt: new Date(options.vipUntil),
    });
  }
  const session = await t.app.get(SessionStore).create(account.id);
  const call = (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: object,
  ) =>
    t.app.inject({
      method,
      url,
      headers: {
        cookie: `${SESSION_COOKIE}=${session.id}`,
        [CSRF_HEADER]: session.csrfToken,
      },
      ...(payload && { payload }),
    });
  /** Uma chamada com o corpo cru (ex.: a foto de perfil), no `Content-Type` dado. */
  const raw = (
    method: 'POST' | 'PUT' | 'PATCH',
    url: string,
    payload: Buffer,
    contentType: string,
    headers: Record<string, string> = {},
  ) =>
    t.app.inject({
      method,
      url,
      headers: {
        cookie: `${SESSION_COOKIE}=${session.id}`,
        [CSRF_HEADER]: session.csrfToken,
        'content-type': contentType,
        ...headers,
      },
      payload,
    });
  return {
    account,
    steamId,
    call,
    raw,
    /** Adiciona o Item ao Inventário e devolve o uid; falha o teste se a API recusar. */
    async add(item: Cs2Item): Promise<string> {
      const response = await call('POST', '/api/inventory/items', { item });
      if (response.statusCode !== 201) throw new Error(`add ${item.id}: ${response.body}`);
      return inventoryItemSchema.parse(response.json()).uid;
    },
    async equip(uid: string, sides?: ('ct' | 't')[]): Promise<void> {
      const response = await call('POST', '/api/loadout/equip', { uid, ...(sides && { sides }) });
      if (response.statusCode !== 200) throw new Error(`equip ${uid}: ${response.body}`);
    },
  };
}
