import {
  CSRF_HEADER,
  type Cs2Item,
  currentSessionSchema,
  INVENTORY_MAX_ITEMS,
  inventoryErrorSchema,
  inventoryItemSchema,
  inventorySchema,
  itemUsagesSchema,
  removedInventoryItemSchema,
} from '@carmine/contracts';
import { sql } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/session-cookies.js';
import { SessionStore } from '../src/auth/sessions.js';
import { inventoryItems, vipPeriods } from '../src/database/schema.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

/** Ids do catálogo da cs2-lib 9.5.0. */
const AK_REDLINE = 222; // float de 0,10 a 0,70
const STICKER = 1847;
const AGENT = 8620;
const MUSIC_KIT = 1780;
const DEFAULT_AK = 4;

/** A AK do aceite da S04: float 0,15, seed 661, StatTrak e 2 stickers. */
const acceptanceAk: Cs2Item = {
  id: AK_REDLINE,
  wear: 0.15,
  seed: 661,
  statTrak: 0,
  stickers: {
    '0': { id: STICKER, schema: 0, wear: 0.1, rotation: 15 },
    '1': { id: STICKER, schema: 2, x: 0.1, y: 0.05 },
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Inventário', () => {
  let t: TestApp;
  let sessions: SessionStore;
  let nextSteamId = 1;

  beforeAll(async () => {
    t = await startTestApp();
    sessions = t.app.get(SessionStore);
  });

  afterAll(async () => {
    await t?.stop();
  });

  /** Uma Conta reivindicada nova, com sessão aberta, e as chamadas dela à API. */
  async function player(options: { vip?: boolean } = {}) {
    const { account } = await t.accounts.claimOnLogin(steamIdFor(nextSteamId++));
    if (options.vip) {
      await grantVip(account.id, Date.now() - DAY_MS, Date.now() + 30 * DAY_MS);
    }
    const session = await sessions.create(account.id);
    const call = (
      method: 'GET' | 'POST' | 'PUT' | 'DELETE',
      url: string,
      payload?: object,
      csrf: string | null = session.csrfToken,
    ) =>
      t.app.inject({
        method,
        url,
        headers: {
          cookie: `${SESSION_COOKIE}=${session.id}`,
          ...(csrf !== null && { [CSRF_HEADER]: csrf }),
        },
        ...(payload && { payload }),
      });
    return {
      account,
      session,
      list: () => call('GET', '/api/inventory'),
      add: (item: unknown, csrf?: string | null) =>
        call('POST', '/api/inventory/items', { item }, csrf),
      replace: (uid: string, item: unknown) => call('PUT', `/api/inventory/items/${uid}`, { item }),
      usages: (uid: string) => call('GET', `/api/inventory/items/${uid}/usages`),
      remove: (uid: string) => call('DELETE', `/api/inventory/items/${uid}`),
      restore: (uid: string) => call('POST', `/api/inventory/items/${uid}/restore`),
      me: () => call('GET', '/api/me'),
    };
  }

  async function grantVip(accountId: string, startsAt: number, endsAt: number) {
    await t.postgres.db
      .insert(vipPeriods)
      .values({ accountId, startsAt: new Date(startsAt), endsAt: new Date(endsAt) });
  }

  const errorOf = (response: LightMyRequestResponse) => inventoryErrorSchema.parse(response.json());
  const itemOf = (response: LightMyRequestResponse) => inventoryItemSchema.parse(response.json());
  const listOf = async (p: Awaited<ReturnType<typeof player>>) => {
    const response = await p.list();
    expect(response.statusCode, response.body).toBe(200);
    return inventorySchema.parse(response.json()).items;
  };

  describe('acesso', () => {
    it('sem sessão, o Inventário responde 401', async () => {
      const response = await t.app.inject({ url: '/api/inventory' });

      expect(response.statusCode).toBe(401);
    });

    it('uma mutação sem token CSRF é recusada', async () => {
      const p = await player();

      const response = await p.add({ id: AK_REDLINE }, null);

      expect(response.statusCode).toBe(403);
      expect(await listOf(p)).toEqual([]);
    });

    it('as mutações contam no rate limit "mutations"', async () => {
      const p = await player();

      const response = await p.add({ id: AK_REDLINE });

      expect(response.headers['ratelimit-policy']).toMatch(/^"mutations";/);
    });

    it('a Conta começa com o Inventário vazio e o limite de 300', async () => {
      const p = await player();

      const response = await p.list();

      expect(inventorySchema.parse(response.json())).toEqual({ items: [], limit: 300 });
    });
  });

  describe('adicionar', () => {
    it('a AK do aceite (float 0,15, seed 661, StatTrak, 2 stickers) volta igual depois', async () => {
      const p = await player({ vip: true });

      const created = await p.add(acceptanceAk);

      expect(created.statusCode, created.body).toBe(201);
      const item = itemOf(created);
      expect(item.item).toEqual(acceptanceAk);
      expect(await listOf(p)).toEqual([item]);
    });

    it('vários Itens para a mesma arma são permitidos, do mais novo para o mais antigo', async () => {
      const p = await player();

      const first = itemOf(await p.add({ id: AK_REDLINE, wear: 0.2 }));
      const second = itemOf(await p.add({ id: AK_REDLINE, wear: 0.3 }));

      expect((await listOf(p)).map((i) => i.uid)).toEqual([second.uid, first.uid]);
    });

    it('um float fora da faixa da skin é recusado pela API, com a faixa', async () => {
      const p = await player();

      const response = await p.add({ id: AK_REDLINE, wear: 0.05 });

      expect(response.statusCode).toBe(422);
      expect(errorOf(response)).toEqual({
        statusCode: 422,
        code: 'wear_out_of_range',
        message: expect.any(String),
        field: 'wear',
        range: { min: 0.1, max: 0.7 },
      });
      expect(await listOf(p)).toEqual([]);
    });

    it('uma Arma padrão não é um Item', async () => {
      const p = await player();

      const response = await p.add({ id: DEFAULT_AK });

      expect(response.statusCode).toBe(422);
      expect(errorOf(response).code).toBe('default_weapon');
    });

    it('um corpo fora do formato responde invalid_body com o campo', async () => {
      const p = await player();

      const response = await p.add({ id: AK_REDLINE, stickers: { '0': { id: STICKER, foo: 1 } } });

      expect(response.statusCode).toBe(400);
      expect(errorOf(response)).toMatchObject({ code: 'invalid_body', field: 'stickers.0' });
    });

    it('o 301º Item é recusado pela API; um removido não conta no limite', async () => {
      const p = await player();
      await t.postgres.db.insert(inventoryItems).values(
        Array.from({ length: INVENTORY_MAX_ITEMS - 1 }, () => ({
          accountId: p.account.id,
          item: { id: AK_REDLINE },
        })),
      );

      const last = itemOf(await p.add({ id: AK_REDLINE }));
      const overflow = await p.add({ id: AK_REDLINE });

      expect(overflow.statusCode).toBe(409);
      expect(errorOf(overflow).code).toBe('inventory_full');
      expect(await listOf(p)).toHaveLength(INVENTORY_MAX_ITEMS);

      await p.remove(last.uid);
      expect((await p.add({ id: AK_REDLINE })).statusCode).toBe(201);
    });

    it('adições simultâneas com 299 Itens: só uma passa', async () => {
      const p = await player();
      await t.postgres.db.insert(inventoryItems).values(
        Array.from({ length: INVENTORY_MAX_ITEMS - 1 }, () => ({
          accountId: p.account.id,
          item: { id: AK_REDLINE },
        })),
      );

      const results = await Promise.all(
        Array.from({ length: 8 }, () => p.add({ id: AK_REDLINE })),
      );

      expect(results.filter((r) => r.statusCode === 201)).toHaveLength(1);
      expect(results.filter((r) => r.statusCode === 409)).toHaveLength(7);
      expect(await listOf(p)).toHaveLength(INVENTORY_MAX_ITEMS);
    });
  });

  describe('VIP', () => {
    it.each([
      ['um agente', { id: AGENT }, 'id'],
      ['um music kit', { id: MUSIC_KIT }, 'id'],
      ['StatTrak', { id: AK_REDLINE, statTrak: 0 }, 'statTrak'],
      ['nametag', { id: AK_REDLINE, nameTag: 'Carmine' }, 'nameTag'],
    ])('sem Período VIP ativo, %s é recusado com vip_required', async (_, item, field) => {
      const p = await player();

      const response = await p.add(item);

      expect(response.statusCode).toBe(403);
      expect(errorOf(response)).toMatchObject({ code: 'vip_required', field });
      expect(await listOf(p)).toEqual([]);
    });

    it('com Período VIP ativo, agentes, music kits, StatTrak e nametag entram', async () => {
      const p = await player({ vip: true });

      const responses = [
        await p.add({ id: AGENT }),
        await p.add({ id: MUSIC_KIT, statTrak: 0 }),
        await p.add({ id: AK_REDLINE, statTrak: 3, nameTag: 'Carmine' }),
      ];

      expect(responses.map((r) => r.statusCode)).toEqual([201, 201, 201]);
    });

    it('um Período VIP encerrado não vale', async () => {
      const p = await player();
      await grantVip(p.account.id, Date.now() - 31 * DAY_MS, Date.now() - DAY_MS);

      expect(errorOf(await p.add({ id: AGENT })).code).toBe('vip_required');
    });

    it('GET /api/me diz se há VIP e até quando', async () => {
      const free = await player();
      const vip = await player();
      const endsAt = Date.now() + 10 * DAY_MS;
      await grantVip(vip.account.id, Date.now() - DAY_MS, endsAt);

      const [freeMe, vipMe] = [await free.me(), await vip.me()];

      expect(currentSessionSchema.parse(freeMe.json()).vip).toEqual({
        active: false,
        endsAt: null,
      });
      expect(currentSessionSchema.parse(vipMe.json()).vip).toEqual({
        active: true,
        endsAt: new Date(endsAt).toISOString(),
      });
    });
  });

  describe('editar', () => {
    it('substitui os atributos e mantém o uid', async () => {
      const p = await player();
      const created = itemOf(await p.add({ id: AK_REDLINE, wear: 0.2, seed: 1 }));

      const response = await p.replace(created.uid, { id: AK_REDLINE, wear: 0.4 });

      expect(response.statusCode, response.body).toBe(200);
      const edited = itemOf(response);
      expect(edited).toMatchObject({ uid: created.uid, item: { id: AK_REDLINE, wear: 0.4 } });
      expect(edited.item.seed).toBeUndefined();
      expect(await listOf(p)).toEqual([edited]);
    });

    it('a edição passa pelas mesmas regras', async () => {
      const p = await player();
      const created = itemOf(await p.add({ id: AK_REDLINE }));

      const response = await p.replace(created.uid, { id: AK_REDLINE, wear: 0.9 });

      expect(errorOf(response).code).toBe('wear_out_of_range');
    });

    it('o id do catálogo não muda numa edição', async () => {
      const p = await player();
      const created = itemOf(await p.add({ id: AK_REDLINE }));

      const response = await p.replace(created.uid, { id: 215 });

      expect(response.statusCode).toBe(422);
      expect(errorOf(response).code).toBe('item_id_immutable');
    });

    it('o Item de outra Conta não existe para mim', async () => {
      const owner = await player();
      const other = await player();
      const created = itemOf(await owner.add({ id: AK_REDLINE }));

      const responses = [
        await other.replace(created.uid, { id: AK_REDLINE }),
        await other.remove(created.uid),
        await other.usages(created.uid),
        await other.restore(created.uid),
      ];

      expect(responses.map((r) => errorOf(r).code)).toEqual([
        'not_found',
        'not_found',
        'not_found',
        'not_found',
      ]);
      expect(await listOf(owner)).toHaveLength(1);
    });

    it('um uid que não é UUID responde not_found', async () => {
      const p = await player();

      const response = await p.replace('abc', { id: AK_REDLINE });

      expect(response.statusCode).toBe(404);
      expect(errorOf(response).code).toBe('not_found');
    });
  });

  describe('remover e desfazer', () => {
    it('mostra onde o Item está em uso (nenhum lugar, até a S05)', async () => {
      const p = await player();
      const created = itemOf(await p.add({ id: AK_REDLINE }));

      const response = await p.usages(created.uid);

      expect(itemUsagesSchema.parse(response.json())).toEqual({ loadout: [], presets: [] });
    });

    it('remover tira o Item e Desfazer o devolve com o mesmo uid', async () => {
      const p = await player({ vip: true });
      const created = itemOf(await p.add(acceptanceAk));

      const removed = await p.remove(created.uid);

      expect(removed.statusCode, removed.body).toBe(200);
      const body = removedInventoryItemSchema.parse(removed.json());
      expect(body.uid).toBe(created.uid);
      expect(body.usages).toEqual({ loadout: [], presets: [] });
      const window = new Date(body.restorableUntil).getTime() - Date.now();
      expect(window).toBeGreaterThan(25_000);
      expect(window).toBeLessThanOrEqual(30_000);
      expect(await listOf(p)).toEqual([]);
      expect(errorOf(await p.usages(created.uid)).code).toBe('not_found');

      const restored = await p.restore(created.uid);

      expect(restored.statusCode, restored.body).toBe(200);
      expect(itemOf(restored)).toEqual(created);
      expect(await listOf(p)).toEqual([created]);
    });

    it('Desfazer duas vezes só devolve o Item', async () => {
      const p = await player();
      const created = itemOf(await p.add({ id: AK_REDLINE }));
      await p.remove(created.uid);

      const results = [await p.restore(created.uid), await p.restore(created.uid)];

      expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
      expect(await listOf(p)).toHaveLength(1);
    });

    it('depois da janela, Desfazer responde restore_expired', async () => {
      const p = await player();
      const created = itemOf(await p.add({ id: AK_REDLINE }));
      await p.remove(created.uid);
      await t.postgres.db.execute(
        sql`update inventory_items set deleted_at = now() - interval '31 seconds' where id = ${created.uid}`,
      );

      const response = await p.restore(created.uid);

      expect(response.statusCode).toBe(410);
      expect(errorOf(response).code).toBe('restore_expired');
      expect(await listOf(p)).toEqual([]);
    });

    it('remover duas vezes responde not_found na segunda', async () => {
      const p = await player();
      const created = itemOf(await p.add({ id: AK_REDLINE }));

      const results = [await p.remove(created.uid), await p.remove(created.uid)];

      expect(results.map((r) => r.statusCode)).toEqual([200, 404]);
    });

    it('Desfazer com o Inventário cheio é recusado', async () => {
      const p = await player();
      const created = itemOf(await p.add({ id: AK_REDLINE }));
      await p.remove(created.uid);
      await t.postgres.db.insert(inventoryItems).values(
        Array.from({ length: INVENTORY_MAX_ITEMS }, () => ({
          accountId: p.account.id,
          item: { id: AK_REDLINE },
        })),
      );

      const response = await p.restore(created.uid);

      expect(response.statusCode).toBe(409);
      expect(errorOf(response).code).toBe('inventory_full');
    });
  });
});
