import { equippedV5Schema } from '@carmine/contracts';
import { eq, sql } from 'drizzle-orm';
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

  /** Abates feitos antes (o contador só muda pelo servidor). */
  async function setStatTrak(uid: string, count: number): Promise<void> {
    await t.postgres.db
      .update(inventoryItems)
      .set({ item: sql`jsonb_set(${inventoryItems.item}, '{statTrak}', to_jsonb(${count}::int))` })
      .where(eq(inventoryItems.id, uid));
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
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await setStatTrak(ak, 41);
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
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await p.equip(ak);

      const response = await killWith(p.steamId, ak, apiKey);

      expect(response.statusCode).toBe(401);
      expect(await statTrakOf(ak)).toBe(0);
    });

    it('a chave no cabeçalho Authorization também vale', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await p.equip(ak);

      const response = await t.app.inject({
        method: 'POST',
        url: '/api/increment-item-stattrak',
        headers: { authorization: `Bearer ${t.serverKey}` },
        payload: { targetUid: await econUidOf(ak), userId: p.steamId },
      });

      expect(response.statusCode).toBe(204);
      expect(await statTrakOf(ak)).toBe(1);
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
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await p.equip(ak);
      await t.postgres.db
        .update(vipPeriods)
        .set({ endsAt: new Date() })
        .where(eq(vipPeriods.accountId, p.account.id));

      const response = await killWith(p.steamId, ak);

      expect(response.statusCode).toBe(204);
      expect(await statTrakOf(ak)).toBe(0);
    });

    it('um Item que não está no Loadout (o Preset ativo) é ignorado em silêncio', async () => {
      const p = await vipPlayer();
      const deagle = await p.add({ id: DEAGLE, statTrak: 0 });

      const response = await killWith(p.steamId, deagle);

      expect(response.statusCode).toBe(204);
      expect(await statTrakOf(deagle)).toBe(0);
    });

    it('um Item que não é dessa Conta, ou removido, responde 400', async () => {
      const owner = await vipPlayer();
      const other = await vipPlayer();
      const ak = await owner.add({ id: AK_REDLINE, statTrak: 0 });
      await owner.equip(ak);
      const removed = await owner.add({ id: DEAGLE, statTrak: 0 });
      await owner.equip(removed);
      await owner.call('DELETE', `/api/inventory/items/${removed}`);

      const responses = [
        await killWith(other.steamId, ak),
        await killWith(owner.steamId, removed),
        await increment({ apiKey: t.serverKey, targetUid: 999_999, userId: steamIdFor(9999) }),
      ];

      expect(responses.map((r) => r.statusCode)).toEqual([400, 400, 400]);
      expect(await statTrakOf(ak)).toBe(0);
    });

    it('um corpo fora do formato responde 400', async () => {
      const response = await increment({ apiKey: t.serverKey, targetUid: 'x', userId: '123' });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('o contador é do servidor', () => {
    const edit = (p: Awaited<ReturnType<typeof vipPlayer>>, uid: string, item: object) =>
      p.call('PUT', `/api/inventory/items/${uid}`, { item });

    it('adicionar com StatTrak começa em 0, qualquer que seja o valor enviado', async () => {
      const p = await vipPlayer();

      const ak = await p.add({ id: AK_REDLINE, statTrak: 500 });

      expect(await statTrakOf(ak)).toBe(0);
    });

    it('editar ignora o contador enviado e preserva o do servidor', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await setStatTrak(ak, 12);

      const response = await edit(p, ak, { id: AK_REDLINE, wear: 0.3, statTrak: 999 });

      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().item).toEqual({ id: AK_REDLINE, wear: 0.3, statTrak: 12 });
      expect(await statTrakOf(ak)).toBe(12);
    });

    it('desligar o StatTrak zera o contador; religar começa em 0', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await setStatTrak(ak, 30);

      await edit(p, ak, { id: AK_REDLINE });
      const off = await statTrakOf(ak);
      await edit(p, ak, { id: AK_REDLINE, statTrak: 30 });

      expect(off).toBeUndefined();
      expect(await statTrakOf(ak)).toBe(0);
    });

    it('abates simultâneos com uma edição no meio não se perdem', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await p.equip(ak);
      const kills = () => Array.from({ length: 10 }, () => killWith(p.steamId, ak));

      const responses = await Promise.all([
        ...kills(),
        edit(p, ak, { id: AK_REDLINE, wear: 0.42, statTrak: 0 }),
        ...kills(),
      ]);

      expect(responses.map((r) => r.statusCode).sort()).toEqual([200, ...Array(20).fill(204)]);
      const [row] = await t.postgres.db
        .select({ item: inventoryItems.item })
        .from(inventoryItems)
        .where(eq(inventoryItems.id, ak));
      expect(row?.item).toEqual({ id: AK_REDLINE, wear: 0.42, statTrak: 20 });
    });

    it('remover e restaurar mantêm o contador', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await setStatTrak(ak, 8);

      await p.call('DELETE', `/api/inventory/items/${ak}`);
      await p.call('POST', `/api/inventory/items/${ak}/restore`);

      expect(await statTrakOf(ak)).toBe(8);
    });

    it('o mesmo Item em vários Presets conta num contador só', async () => {
      const p = await vipPlayer();
      const ak = await p.add({ id: AK_REDLINE, statTrak: 0 });
      await p.equip(ak);
      const created = await p.call('POST', '/api/presets', { name: 'Retake' });
      const presetId = created.json().id as string;
      await killWith(p.steamId, ak);
      await p.call('POST', `/api/presets/${presetId}/activate`);
      await killWith(p.steamId, ak);

      expect(await statTrakOf(ak)).toBe(2);
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
