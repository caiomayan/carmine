import { equippedV5Schema } from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { inventoryItems, vipPeriods } from '../src/database/schema.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

/** Ids do catálogo da cs2-lib 9.5.0. */
const AK_REDLINE = 222; // TR
const DEAGLE = 66; // CT e TR

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `POST /api/increment-item-stattrak` e `POST /api/consume-item-spray` no formato que o
 * cs2-css-inventory-simulator manda (corpo `{ apiKey, targetUid, userId }`, ADR 0006).
 */
describe('Rotas do cs2-css-inventory-simulator', () => {
  let t: TestApp;
  let next = 1;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  const vipPlayer = () => signedInPlayer(t, next++, { vipUntil: Date.now() + 30 * DAY_MS });

  /** O `uid` numérico do Item no `equipped/v5` (o que o plugin manda em `targetUid`). */
  async function econUidOf(uid: string): Promise<number> {
    const [row] = await t.postgres.db
      .select({ econUid: inventoryItems.econUid })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, uid));
    return row?.econUid ?? -1;
  }

  async function statTrakOf(uid: string): Promise<number | undefined> {
    const [row] = await t.postgres.db
      .select({ item: inventoryItems.item })
      .from(inventoryItems)
      .where(eq(inventoryItems.id, uid));
    return row?.item.statTrak;
  }

  const increment = (payload: object) =>
    t.app.inject({ method: 'POST', url: '/api/increment-item-stattrak', payload });

  const killWith = async (steamId: string, uid: string, apiKey: string | null = t.serverKey) =>
    increment({
      ...(apiKey !== null && { apiKey }),
      targetUid: await econUidOf(uid),
      userId: steamId,
    });

  describe('increment-item-stattrak', () => {
    it('soma 1 ao StatTrak do Item equipado, e o equipped/v5 já mostra o novo valor', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 41 });
      await p.equip(ak);
      const equipped = async () =>
        equippedV5Schema.parse(
          (await t.app.inject({ url: `/api/equipped/v5/${p.steamId}.json` })).json(),
        ).tWeapons?.['7']?.stattrak;
      expect(await equipped()).toBe(41); // aquece o cache

      const response = await killWith(p.steamId, ak);

      expect(response.statusCode, response.body).toBe(204);
      expect(response.body).toBe('');
      expect(await statTrakOf(ak)).toBe(42);
      expect(await equipped()).toBe(42);
    });

    it('incrementos simultâneos não se perdem', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await p.equip(ak);

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => killWith(p.steamId, ak)),
      );

      expect(responses.map((r) => r.statusCode)).toEqual(Array(10).fill(204));
      expect(await statTrakOf(ak)).toBe(10);
    });

    it('conta no rate limit "server" do Servidor Carmine', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await p.equip(ak);

      const response = await killWith(p.steamId, ak);

      expect(response.headers['ratelimit-policy']).toMatch(/^"server";/);
    });

    it.each([
      ['sem apiKey', null],
      ['com uma chave inválida', 'chave-errada'],
    ])('%s responde 401 e não conta', async (_, apiKey) => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 5 });
      await p.equip(ak);

      const response = await killWith(p.steamId, ak, apiKey);

      expect(response.statusCode).toBe(401);
      expect(await statTrakOf(ak)).toBe(5);
    });

    it('a chave no cabeçalho Authorization também vale', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 5 });
      await p.equip(ak);

      const response = await t.app.inject({
        method: 'POST',
        url: '/api/increment-item-stattrak',
        headers: { authorization: `Bearer ${t.serverKey}` },
        payload: { targetUid: await econUidOf(ak), userId: p.steamId },
      });

      expect(response.statusCode).toBe(204);
      expect(await statTrakOf(ak)).toBe(6);
    });

    it('um Item sem StatTrak é ignorado em silêncio', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE });
      await p.equip(ak);

      const response = await killWith(p.steamId, ak);

      expect(response.statusCode).toBe(204);
      expect(await statTrakOf(ak)).toBeUndefined();
    });

    it('sem Período VIP ativo, é ignorado em silêncio', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 7 });
      await p.equip(ak);
      await t.postgres.db
        .update(vipPeriods)
        .set({ endsAt: new Date() })
        .where(eq(vipPeriods.accountId, p.account.id));

      const response = await killWith(p.steamId, ak);

      expect(response.statusCode).toBe(204);
      expect(await statTrakOf(ak)).toBe(7);
    });

    it('um Item que não está no Loadout (o Preset ativo) é ignorado em silêncio', async () => {
      const p = await vipPlayer();
      const deagle = await p.add({ id: DEAGLE, statTrak: 2 });

      const response = await killWith(p.steamId, deagle);

      expect(response.statusCode).toBe(204);
      expect(await statTrakOf(deagle)).toBe(2);
    });

    it('um Item que não é dessa Conta, ou removido, responde 400', async () => {
      const owner = await vipPlayer();
      const other = await vipPlayer();
      const ak = await owner.add({ id: AK_REDLINE, statTrak: 1 });
      await owner.equip(ak);
      const removed = await owner.add({ id: DEAGLE, statTrak: 1 });
      await owner.equip(removed);
      await owner.call('DELETE', `/api/inventory/items/${removed}`);

      const responses = [
        await killWith(other.steamId, ak),
        await killWith(owner.steamId, removed),
        await increment({ apiKey: t.serverKey, targetUid: 999_999, userId: steamIdFor(9999) }),
      ];

      expect(responses.map((r) => r.statusCode)).toEqual([400, 400, 400]);
      expect(await statTrakOf(ak)).toBe(1);
    });

    it('um corpo fora do formato responde 400', async () => {
      const response = await increment({ apiKey: t.serverKey, targetUid: 'x', userId: '123' });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('consume-item-spray', () => {
    it('não faz nada (grafites não são Itens), mas responde 204 ao Servidor Carmine', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/api/consume-item-spray',
        payload: { apiKey: t.serverKey, targetUid: 1, userId: steamIdFor(1) },
      });

      expect(response.statusCode).toBe(204);
    });

    it('sem a chave do Servidor Carmine, 401', async () => {
      const response = await t.app.inject({
        method: 'POST',
        url: '/api/consume-item-spray',
        payload: { targetUid: 1, userId: steamIdFor(1) },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
