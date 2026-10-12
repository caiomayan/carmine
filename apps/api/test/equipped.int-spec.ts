import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { equippedV5Schema } from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EquippedCache } from '../src/equipped/equipped-cache.js';
import { VipPeriods } from '../src/vip/vip-periods.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

/** Loadout vazio no formato do cs2-css-inventory-simulator: todo slot fica com a Arma padrão. */
const EMPTY_LOADOUT = '{"agents":{},"ctWeapons":{},"gloves":{},"knives":{},"tWeapons":{}}';

/**
 * A resposta real com cada categoria, lida pelo teste C# do plugin
 * (`EquippedV5CompatibilityTests`). Para regravar: `UPDATE_FIXTURES=1 pnpm vitest run
 * test/equipped.int-spec.ts`.
 */
const FULL_LOADOUT_FIXTURE = path.resolve(
  import.meta.dirname,
  '../../../plugins/tests/Carmine.Core.Tests/Fixtures/equipped-v5-full-loadout.json',
);

/** Ids do catálogo da cs2-lib 9.5.0. */
const AK_REDLINE = 222; // TR
const M4A1S = 1089; // CT
const DEAGLE = 66; // CT e TR
const BAYONET = 1211;
const GLOVES = 1707;
const AGENT_T = 8620;
const AGENT_CT = 8629;
const MUSIC_KIT = 1780;
const STICKER = 1847;
const CHARM = 15407; // com sticker

const DAY_MS = 24 * 60 * 60 * 1000;

/** Percentil `p` (0 a 1) das amostras. */
function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

describe('GET /api/equipped/v5/{steamId}.json', () => {
  let t: TestApp;
  let fullLoadoutSteamId: string;
  let nextPlayer = 100;
  let nextIp = 1;

  /** Cada chamada vem de um IP novo, para não esbarrar no limite do teste de 429. */
  const equipped = (steamId: string, remoteAddress = `10.0.${nextIp >> 8}.${nextIp++ & 255}`) =>
    t.app.inject({ method: 'GET', url: `/api/equipped/v5/${steamId}.json`, remoteAddress });

  beforeAll(async () => {
    t = await startTestApp({ RATE_LIMIT_EQUIPPED_PER_MINUTE: '5' });
    // Primeiro, num banco vazio: os uids numéricos (e os hashes) ficam iguais a cada execução.
    const p = await signedInPlayer(t, 1, { vipUntil: Date.now() + 30 * DAY_MS });
    fullLoadoutSteamId = p.steamId;
    const ak = await p.add({
      id: AK_REDLINE,
      wear: 0.15,
      seed: 661,
      statTrak: 0,
      nameTag: 'Carmine',
      stickers: {
        '0': { id: STICKER, schema: 0, wear: 0.1, rotation: 15 },
        '1': { id: STICKER, schema: 2, x: 0.1, y: 0.05 },
      },
      keychains: { '0': { id: CHARM, seed: 42 } },
    });
    const m4 = await p.add({ id: M4A1S, wear: 0.2, seed: 7 });
    const deagle = await p.add({ id: DEAGLE, wear: 0.3, seed: 1000 });
    const knife = await p.add({ id: BAYONET, wear: 0.07, seed: 3, statTrak: 0 });
    const gloves = await p.add({ id: GLOVES, wear: 0.5, seed: 9 });
    const agentT = await p.add({ id: AGENT_T });
    const agentCt = await p.add({ id: AGENT_CT });
    const kit = await p.add({ id: MUSIC_KIT, statTrak: 0 });
    for (const uid of [ak, m4, deagle, knife, gloves, agentT, agentCt, kit]) await p.equip(uid);
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('devolve o Loadout real com cada categoria, no formato exato do plugin', async () => {
    const response = await equipped(fullLoadoutSteamId);

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    const body = equippedV5Schema.parse(response.json());
    if (process.env.UPDATE_FIXTURES === '1') {
      await writeFile(FULL_LOADOUT_FIXTURE, `${JSON.stringify(body, null, 2)}\n`);
    }
    expect(body).toEqual(JSON.parse(await readFile(FULL_LOADOUT_FIXTURE, 'utf8')));
    expect(Object.keys(body.ctWeapons ?? {}).sort()).toEqual(['1', '60']);
    expect(Object.keys(body.tWeapons ?? {}).sort()).toEqual(['1', '7']);
    expect(Object.keys(body.knives ?? {})).toEqual(['2', '3']);
    expect(Object.keys(body.gloves ?? {})).toEqual(['2', '3']);
    expect(body.agents).toMatchObject({ '2': { def: 5105 }, '3': { def: 5305 } });
    expect(body.musicKit).toMatchObject({ musicId: 3, stattrak: 0 });
  });

  it('é público e devolve o Loadout vazio de uma Conta que já jogou', async () => {
    const steamId = steamIdFor(2);
    await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName: 'jogador' },
    });

    const response = await equipped(steamId);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(EMPTY_LOADOUT);
  });

  it('devolve o Loadout vazio também para quem ainda não tem Conta', async () => {
    const response = await equipped(steamIdFor(999));

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(EMPTY_LOADOUT);
  });

  it('responde 400 a um SteamID inválido', async () => {
    const response = await equipped('123');

    expect(response.statusCode).toBe(400);
  });

  describe('cache', () => {
    it('cada mudança no Loadout ou num Item equipado aparece na hora', async () => {
      const p = await signedInPlayer(t, nextPlayer++);
      const first = await p.add({ id: AK_REDLINE, wear: 0.2 });
      const second = await p.add({ id: AK_REDLINE, wear: 0.3 });
      const wearOf = async () => {
        const body = equippedV5Schema.parse((await equipped(p.steamId)).json());
        return body.tWeapons?.['7']?.wear ?? null;
      };

      const before = await wearOf();
      await p.equip(first);
      const afterEquip = await wearOf();
      await p.equip(second);
      const afterReplace = await wearOf();
      await p.call('PUT', `/api/inventory/items/${second}`, {
        item: { id: AK_REDLINE, wear: 0.4 },
      });
      const afterEdit = await wearOf();
      await p.call('DELETE', `/api/inventory/items/${second}`);
      const afterRemove = await wearOf();
      await p.call('POST', `/api/inventory/items/${second}/restore`);
      const afterRestore = await wearOf();

      expect([before, afterEquip, afterReplace, afterEdit, afterRemove, afterRestore]).toEqual([
        null,
        0.2,
        0.3,
        0.4,
        null,
        0.4,
      ]);
    });

    it('a concessão de VIP pela Staff invalida a resposta: o agente entra', async () => {
      const p = await signedInPlayer(t, nextPlayer++, { vipUntil: Date.now() + DAY_MS });
      await p.equip(await p.add({ id: AGENT_T }));
      const vip = new VipPeriods(t.postgres.db);
      await vip.revoke(p.account.id, { actorSteamId: steamIdFor(900), reason: 'teste' });
      await t.app.get(EquippedCache).invalidate(p.steamId);
      const withoutVip = equippedV5Schema.parse((await equipped(p.steamId)).json());

      await vip.grant(p.account.id, 1, new Date(), { actorSteamId: steamIdFor(900), reason: 't' });
      await t.app.get(EquippedCache).invalidate(p.steamId); // o que o CLI faz depois de gravar
      const withVip = equippedV5Schema.parse((await equipped(p.steamId)).json());

      expect(withoutVip.agents).toEqual({});
      expect(withVip.agents?.['2']?.def).toBe(5105);
    });

    it('no fim do Período VIP, o agente sai sem ninguém invalidar o cache', async () => {
      const p = await signedInPlayer(t, nextPlayer++, { vipUntil: Date.now() + 1500 });
      await p.equip(await p.add({ id: AGENT_T }));
      await p.equip(await p.add({ id: AK_REDLINE, statTrak: 0, nameTag: 'Carmine' }));

      const during = equippedV5Schema.parse((await equipped(p.steamId)).json());
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const after = equippedV5Schema.parse((await equipped(p.steamId)).json());

      expect(during.agents?.['2']?.def).toBe(5105);
      expect(during.tWeapons?.['7']).toMatchObject({ stattrak: 0, nametag: 'Carmine' });
      expect(after.agents).toEqual({});
      expect(after.tWeapons?.['7']).toMatchObject({ stattrak: -1, nametag: '', paint: 282 });
    });

    it('responde em p95 < 200 ms com cache', async () => {
      await equipped(fullLoadoutSteamId);
      const samples: number[] = [];

      for (let i = 0; i < 200; i++) {
        const start = performance.now();
        const response = await equipped(fullLoadoutSteamId);
        samples.push(performance.now() - start);
        expect(response.statusCode).toBe(200);
      }

      const p95 = percentile(samples, 0.95);
      console.info(
        `equipped/v5 com cache: p50 ${percentile(samples, 0.5).toFixed(1)} ms, p95 ${p95.toFixed(1)} ms`,
      );
      expect(p95).toBeLessThan(200);
      expect(
        await t.valkey.exec(['redis-cli', 'EXISTS', `equipped:v5:${fullLoadoutSteamId}`]),
      ).toMatchObject({
        output: '1\n',
      });
    });
  });

  describe('rate limit', () => {
    it('limita as requisições por IP e responde 429 acima do limite, sem afetar outros IPs', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await equipped(steamIdFor(i), '198.51.100.20')).statusCode);
      }
      const otherIp = await equipped(steamIdFor(1), '198.51.100.21');

      expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
      expect(otherIp.statusCode).toBe(200);
    });

    it('o limite vale só para o equipped: o health do mesmo IP continua respondendo', async () => {
      const response = await t.app.inject({
        method: 'GET',
        url: '/api/health',
        remoteAddress: '198.51.100.20',
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
