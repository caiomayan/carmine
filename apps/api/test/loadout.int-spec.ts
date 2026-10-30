import {
  CSRF_HEADER,
  type Cs2Item,
  currentSessionSchema,
  inventoryItemSchema,
  itemUsagesSchema,
  type Loadout,
  loadoutChangeSchema,
  loadoutErrorSchema,
  loadoutSchema,
  type Plan,
  PRESETS_CAPO_LIMIT,
  PRESETS_PADRINHO_LIMIT,
  presetListSchema,
  presetSchema,
  profileSchema,
  removedInventoryItemSchema,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/session-cookies.js';
import { SessionStore } from '../src/auth/sessions.js';
import { vipPeriods } from '../src/database/schema.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

/** Ids do catálogo da cs2-lib 9.5.0. */
const AK_REDLINE = 222; // só TR
const DEAGLE = 66; // CT e TR
const M4A1S = 1089; // só CT
const BAYONET = 1211;
const AGENT_T = 8620;
const MUSIC_KIT = 1780;

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Loadout e Presets', () => {
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
  async function player(options: { vip?: boolean; plan?: Plan } = {}) {
    const steamId = steamIdFor(nextSteamId++);
    const { account } = await t.accounts.claimOnLogin(steamId);
    if (options.vip || options.plan) await grantVip(account.id, undefined, options.plan);
    const session = await sessions.create(account.id);
    const call = (
      method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
    const add = async (item: Cs2Item) => {
      const response = await call('POST', '/api/inventory/items', { item });
      expect(response.statusCode, response.body).toBe(201);
      return inventoryItemSchema.parse(response.json()).uid;
    };
    return {
      account,
      steamId,
      call,
      add,
      loadout: (presetId?: string) =>
        call('GET', `/api/loadout${presetId ? `?presetId=${presetId}` : ''}`),
      equip: (body: object, csrf?: string | null) => call('POST', '/api/loadout/equip', body, csrf),
      unequip: (body: object) => call('POST', '/api/loadout/unequip', body),
      assign: (body: object) => call('POST', '/api/loadout/assign', body),
      presets: () => call('GET', '/api/presets'),
      createPreset: (body: object) => call('POST', '/api/presets', body),
      renamePreset: (id: string, name: string) => call('PATCH', `/api/presets/${id}`, { name }),
      activate: (id: string) => call('POST', `/api/presets/${id}/activate`),
      deletePreset: (id: string) => call('DELETE', `/api/presets/${id}`),
      usages: (uid: string) => call('GET', `/api/inventory/items/${uid}/usages`),
      remove: (uid: string) => call('DELETE', `/api/inventory/items/${uid}`),
      restore: (uid: string) => call('POST', `/api/inventory/items/${uid}/restore`),
    };
  }

  type Player = Awaited<ReturnType<typeof player>>;

  async function grantVip(
    accountId: string,
    endsAt = Date.now() + 30 * DAY_MS,
    plan: Plan = 'capo',
  ) {
    await t.postgres.db.insert(vipPeriods).values({
      accountId,
      plan,
      startsAt: new Date(Date.now() - DAY_MS),
      endsAt: new Date(endsAt),
    });
  }

  /** O VIP acaba agora (como a revogação pela Staff). */
  async function endVip(accountId: string) {
    await t.postgres.db
      .update(vipPeriods)
      .set({ endsAt: new Date() })
      .where(eq(vipPeriods.accountId, accountId));
  }

  const ok = <T>(response: LightMyRequestResponse, parse: (body: unknown) => T, status = 200) => {
    expect(response.statusCode, response.body).toBe(status);
    return parse(response.json());
  };
  const loadoutOf = async (p: Player, presetId?: string) =>
    ok(await p.loadout(presetId), (body) => loadoutSchema.parse(body));
  const changeOf = (response: LightMyRequestResponse) =>
    ok(response, (body) => loadoutChangeSchema.parse(body));
  const errorOf = (response: LightMyRequestResponse) => loadoutErrorSchema.parse(response.json());
  const presetsOf = async (p: Player) =>
    ok(await p.presets(), (body) => presetListSchema.parse(body));

  /** O uid em cada slot com Item, ex.: `{ 'weapon_ak47:t': uid }`. */
  const equippedIn = (loadout: Loadout) =>
    Object.fromEntries(
      loadout.entries.filter((e) => e.uid !== null).map((e) => [`${e.slot}:${e.side}`, e.uid]),
    );

  describe('acesso', () => {
    it('sem sessão, o Loadout e os Presets respondem 401', async () => {
      expect((await t.app.inject({ url: '/api/loadout' })).statusCode).toBe(401);
      expect((await t.app.inject({ url: '/api/presets' })).statusCode).toBe(401);
    });

    it('equipar sem token CSRF é recusado', async () => {
      const p = await player();
      const uid = await p.add({ id: AK_REDLINE });

      const response = await p.equip({ uid }, null);

      expect(response.statusCode).toBe(403);
      expect(equippedIn(await loadoutOf(p))).toEqual({});
    });

    it('as mutações contam no rate limit "mutations"', async () => {
      const p = await player();
      const uid = await p.add({ id: AK_REDLINE });

      const response = await p.equip({ uid });

      expect(response.headers['ratelimit-policy']).toMatch(/^"mutations";/);
    });
  });

  describe('Loadout', () => {
    it('uma Conta nova tem o Preset principal ativo com todos os slots na Arma padrão', async () => {
      const p = await player();

      const loadout = await loadoutOf(p);

      expect(loadout).toMatchObject({ presetName: 'Principal', active: true, readOnly: false });
      expect(loadout.entries.every((entry) => entry.uid === null)).toBe(true);
      const slots = loadout.entries.map((e) => `${e.slot}:${e.side}`);
      expect(slots).toContain('weapon_ak47:t');
      expect(slots).not.toContain('weapon_ak47:ct');
      expect(slots.at(-1)).toBe('musicKit:null');
    });

    it('equipar sem lados usa todos os lados em que o Item existe', async () => {
      const p = await player();
      const deagle = await p.add({ id: DEAGLE });
      const ak = await p.add({ id: AK_REDLINE });

      const first = changeOf(await p.equip({ uid: deagle }));
      const second = changeOf(await p.equip({ uid: ak }));

      expect(first.previous).toEqual([
        { slot: 'weapon_deagle', side: 'ct', uid: null },
        { slot: 'weapon_deagle', side: 't', uid: null },
      ]);
      expect(equippedIn(second.loadout)).toEqual({
        'weapon_deagle:ct': deagle,
        'weapon_deagle:t': deagle,
        'weapon_ak47:t': ak,
      });
    });

    it('equipar só num lado deixa o outro como estava', async () => {
      const p = await player();
      const deagle = await p.add({ id: DEAGLE });

      const change = changeOf(await p.equip({ uid: deagle, sides: ['ct'] }));

      expect(equippedIn(change.loadout)).toEqual({ 'weapon_deagle:ct': deagle });
    });

    it('um lado em que o Item não existe é recusado (a AK no CT, a M4A1-S no TR)', async () => {
      const p = await player();
      const ak = await p.add({ id: AK_REDLINE });
      const m4 = await p.add({ id: M4A1S });

      const responses = [
        await p.equip({ uid: ak, sides: ['ct'] }),
        await p.equip({ uid: m4, sides: ['ct', 't'] }),
      ];

      expect(responses.map((r) => r.statusCode)).toEqual([422, 422]);
      expect(errorOf(responses[0] as LightMyRequestResponse)).toMatchObject({
        code: 'side_not_allowed',
        field: 'sides.0',
      });
      expect(errorOf(responses[1] as LightMyRequestResponse).field).toBe('sides.1');
    });

    it('equipar outro Item no mesmo slot substitui, e o Desfazer devolve o anterior', async () => {
      const p = await player();
      const first = await p.add({ id: AK_REDLINE, wear: 0.2 });
      const second = await p.add({ id: AK_REDLINE, wear: 0.3 });
      await p.equip({ uid: first });

      const replaced = changeOf(await p.equip({ uid: second }));
      const undone = changeOf(await p.assign({ assignments: replaced.previous }));

      expect(replaced.previous).toEqual([{ slot: 'weapon_ak47', side: 't', uid: first }]);
      expect(equippedIn(replaced.loadout)).toEqual({ 'weapon_ak47:t': second });
      expect(equippedIn(undone.loadout)).toEqual({ 'weapon_ak47:t': first });
      expect(undone.previous).toEqual([{ slot: 'weapon_ak47', side: 't', uid: second }]);
    });

    it('equipar o que já está equipado não muda nada', async () => {
      const p = await player();
      const ak = await p.add({ id: AK_REDLINE });
      await p.equip({ uid: ak });

      expect(changeOf(await p.equip({ uid: ak })).previous).toEqual([]);
    });

    it('desequipar volta à Arma padrão nos lados pedidos, e o Desfazer reequipa', async () => {
      const p = await player();
      const knife = await p.add({ id: BAYONET });
      await p.equip({ uid: knife });

      const unequipped = changeOf(await p.unequip({ slot: 'knife', sides: ['t'] }));
      const undone = changeOf(await p.assign({ assignments: unequipped.previous }));

      expect(equippedIn(unequipped.loadout)).toEqual({ 'knife:ct': knife });
      expect(unequipped.previous).toEqual([{ slot: 'knife', side: 't', uid: knife }]);
      expect(equippedIn(undone.loadout)).toEqual({ 'knife:ct': knife, 'knife:t': knife });
    });

    it('o music kit não tem lado', async () => {
      const p = await player({ vip: true });
      const kit = await p.add({ id: MUSIC_KIT });

      const change = changeOf(await p.equip({ uid: kit, sides: ['ct'] }));
      const unequipped = changeOf(await p.unequip({ slot: 'musicKit' }));

      expect(equippedIn(change.loadout)).toEqual({ 'musicKit:null': kit });
      expect(unequipped.previous).toEqual([{ slot: 'musicKit', side: null, uid: kit }]);
    });

    it('assign recusa um Item no slot errado, um slot que não existe e um lado impossível', async () => {
      const p = await player();
      const ak = await p.add({ id: AK_REDLINE });

      const responses = [
        await p.assign({ assignments: [{ slot: 'weapon_deagle', side: 't', uid: ak }] }),
        await p.assign({ assignments: [{ slot: 'weapon_c4', side: 't', uid: null }] }),
        await p.assign({ assignments: [{ slot: 'weapon_ak47', side: 'ct', uid: null }] }),
        await p.assign({ assignments: [{ slot: 'musicKit', side: 't', uid: null }] }),
      ];

      expect(responses.map((r) => errorOf(r).code)).toEqual([
        'invalid_slot',
        'invalid_slot',
        'side_not_allowed',
        'side_not_allowed',
      ]);
      expect(errorOf(responses[0] as LightMyRequestResponse).field).toBe('assignments.0.uid');
    });

    it('o Item de outra Conta não existe para quem equipa', async () => {
      const owner = await player();
      const other = await player();
      const ak = await owner.add({ id: AK_REDLINE });

      const response = await other.equip({ uid: ak });

      expect(response.statusCode).toBe(404);
      expect(errorOf(response)).toMatchObject({ code: 'item_not_found', field: 'uid' });
    });

    it('um corpo fora do formato responde invalid_body', async () => {
      const p = await player();

      const response = await p.equip({ uid: 'nao-e-uuid', sides: [] });

      expect(response.statusCode).toBe(400);
      expect(errorOf(response).code).toBe('invalid_body');
    });

    it('sem VIP, um Item VIP equipado fica no Loadout, mas marcado como fora do jogo', async () => {
      const p = await player({ vip: true });
      const agent = await p.add({ id: AGENT_T });
      const ak = await p.add({ id: AK_REDLINE, statTrak: 10, nameTag: 'Carmine' });
      await p.equip({ uid: agent });
      await p.equip({ uid: ak });
      await endVip(p.account.id);

      const entries = (await loadoutOf(p)).entries.filter((e) => e.uid !== null);

      expect(entries.map((e) => [e.slot, e.notInGame, e.strippedInGame])).toEqual([
        ['weapon_ak47', null, ['statTrak', 'nameTag']],
        ['agent', 'vip_inactive', []],
      ]);
    });
  });

  describe('Presets', () => {
    it('no grátis, só o principal, com limite 1, e criar exige VIP', async () => {
      const p = await player();

      const list = await presetsOf(p);
      const created = await p.createPreset({ name: 'Retake' });

      expect(list.limit).toBe(1);
      expect(list.presets).toEqual([
        expect.objectContaining({ name: 'Principal', main: true, active: true, readOnly: false }),
      ]);
      expect(created.statusCode).toBe(403);
      expect(errorOf(created).code).toBe('vip_required');
    });

    it('com VIP, cria uma cópia do Loadout atual (ou vazio), renomeia e ativa de uma vez', async () => {
      const p = await player({ vip: true });
      const ak = await p.add({ id: AK_REDLINE });
      const deagle = await p.add({ id: DEAGLE });
      await p.equip({ uid: ak });

      const copy = ok(await p.createPreset({ name: 'Retake' }), presetSchema.parse, 201);
      const empty = ok(
        await p.createPreset({ name: 'Vazio', from: 'empty' }),
        presetSchema.parse,
        201,
      );
      await p.equip({ uid: deagle, presetId: copy.id });
      const renamed = ok(await p.renamePreset(copy.id, 'Retake B'), presetSchema.parse);
      const afterActivate = ok(await p.activate(copy.id), presetListSchema.parse);

      expect(copy).toMatchObject({ main: false, active: false, equippedCount: 1 });
      expect(empty.equippedCount).toBe(0);
      expect(renamed.name).toBe('Retake B');
      expect(afterActivate.limit).toBe(PRESETS_CAPO_LIMIT);
      expect(afterActivate.presets.map((x) => [x.name, x.active])).toEqual([
        ['Principal', false],
        ['Retake B', true],
        ['Vazio', false],
      ]);
      expect(equippedIn(await loadoutOf(p))).toEqual({
        'weapon_ak47:t': ak,
        'weapon_deagle:ct': deagle,
        'weapon_deagle:t': deagle,
      });
      // O principal não mudou com a edição do outro Preset.
      const main = afterActivate.presets[0]?.id as string;
      expect(equippedIn(await loadoutOf(p, main))).toEqual({ 'weapon_ak47:t': ak });
    });

    it('cada Preset traz os destaques da carta: faca, luvas e o rifle de cada lado, só com Itens', async () => {
      const p = await player({ vip: true });
      const knife = await p.add({ id: BAYONET });
      const ak = await p.add({ id: AK_REDLINE });
      const m4 = await p.add({ id: M4A1S });
      const deagle = await p.add({ id: DEAGLE });
      await p.equip({ uid: knife });
      await p.equip({ uid: ak });
      await p.equip({ uid: m4 });
      await p.equip({ uid: deagle });
      const copy = ok(await p.createPreset({ name: 'Retake' }), presetSchema.parse, 201);
      const empty = ok(
        await p.createPreset({ name: 'Vazio', from: 'empty' }),
        presetSchema.parse,
        201,
      );

      const list = ok(await p.presets(), presetListSchema.parse);
      const byName = Object.fromEntries(list.presets.map((preset) => [preset.name, preset]));

      const expected = [
        { slot: 'knife', side: 'ct', uid: knife },
        { slot: 'knife', side: 't', uid: knife },
        { slot: 'weapon_ak47', side: 't', uid: ak },
        { slot: 'weapon_m4a1_silencer', side: 'ct', uid: m4 },
      ];
      // A pistola não é destaque; o principal e a cópia têm os mesmos, e o vazio nenhum.
      const sorted = (preset: { highlights: { slot: string; side: string | null }[] }) =>
        [...preset.highlights].sort((a, b) =>
          `${a.slot}${a.side}`.localeCompare(`${b.slot}${b.side}`),
        );
      expect(sorted(byName.Principal as never)).toEqual(
        expect.arrayContaining(expected.map((assignment) => expect.objectContaining(assignment))),
      );
      expect(byName.Principal?.highlights).toHaveLength(expected.length);
      expect(byName.Retake?.highlights).toHaveLength(expected.length);
      expect(copy.highlights).toHaveLength(expected.length);
      expect(empty.highlights).toEqual([]);
      expect(byName.Vazio?.highlights).toEqual([]);
    });

    it('um Item removido do Inventário sai dos destaques', async () => {
      const p = await player();
      const knife = await p.add({ id: BAYONET });
      await p.equip({ uid: knife });
      expect((await presetsOf(p)).presets[0]?.highlights).toHaveLength(2);

      expect((await p.remove(knife)).statusCode).toBe(200);

      expect((await presetsOf(p)).presets[0]?.highlights).toEqual([]);
    });

    it('nomes repetidos são aceitos; nome vazio ou longo demais não', async () => {
      const p = await player({ vip: true });

      const statuses = [
        (await p.createPreset({ name: 'Igual' })).statusCode,
        (await p.createPreset({ name: 'Igual' })).statusCode,
        (await p.createPreset({ name: '   ' })).statusCode,
        (await p.createPreset({ name: 'x'.repeat(33) })).statusCode,
      ];

      expect(statuses).toEqual([201, 201, 400, 400]);
    });

    it(`o Capo tem até ${PRESETS_CAPO_LIMIT} Presets contando o principal`, async () => {
      const p = await player({ plan: 'capo' });
      for (let i = 1; i < PRESETS_CAPO_LIMIT; i++) {
        expect((await p.createPreset({ name: `P${i}` })).statusCode).toBe(201);
      }

      const response = await p.createPreset({ name: 'demais' });

      expect(response.statusCode).toBe(409);
      expect(errorOf(response).code).toBe('preset_limit');
    });

    it(`o Padrinho tem até ${PRESETS_PADRINHO_LIMIT} Presets contando o principal`, async () => {
      const p = await player({ plan: 'padrinho' });
      for (let i = 1; i < PRESETS_PADRINHO_LIMIT; i++) {
        expect((await p.createPreset({ name: `P${i}` })).statusCode).toBe(201);
      }
      expect((await presetsOf(p)).limit).toBe(PRESETS_PADRINHO_LIMIT);

      const response = await p.createPreset({ name: 'demais' });

      expect(response.statusCode).toBe(409);
      expect(errorOf(response).code).toBe('preset_limit');
    });

    it('ao cair de Padrinho para Capo, o que passa do limite fica só leitura até voltar a caber', async () => {
      const p = await player({ plan: 'padrinho' });
      const created = [];
      for (let i = 1; i <= 9; i++) {
        created.push(ok(await p.createPreset({ name: `P${i}` }), presetSchema.parse, 201));
      }
      const accountPeriods = () => t.postgres.db.update(vipPeriods).set({ plan: 'capo' });

      await accountPeriods().where(eq(vipPeriods.accountId, p.account.id));

      const list = await presetsOf(p);
      expect(list.limit).toBe(PRESETS_CAPO_LIMIT);
      // O principal e os 5 mais antigos seguem editáveis; o resto fica guardado.
      expect(list.presets.map((x) => x.readOnly)).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
        true,
        true,
        true,
        true,
      ]);
      const held = created[7] as { id: string };
      const attempt = await p.renamePreset(held.id, 'não pode');
      expect(attempt.statusCode).toBe(403);
      expect(errorOf(attempt).code).toBe('preset_read_only');
      const kept = created[2] as { id: string };
      expect((await p.renamePreset(kept.id, 'pode')).statusCode).toBe(200);

      await t.postgres.db
        .update(vipPeriods)
        .set({ plan: 'padrinho' })
        .where(eq(vipPeriods.accountId, p.account.id));
      expect((await presetsOf(p)).presets.every((x) => !x.readOnly)).toBe(true);
    });

    it('apagar o ativo devolve o principal ao Loadout; o principal não é apagado', async () => {
      const p = await player({ vip: true });
      const extra = ok(await p.createPreset({ name: 'Extra' }), presetSchema.parse, 201);
      await p.activate(extra.id);
      const mainId = (await presetsOf(p)).presets[0]?.id as string;

      const deleted = ok(await p.deletePreset(extra.id), presetListSchema.parse);
      const mainDelete = await p.deletePreset(mainId);

      expect(deleted.presets).toEqual([expect.objectContaining({ main: true, active: true })]);
      expect(mainDelete.statusCode).toBe(409);
      expect(errorOf(mainDelete).code).toBe('preset_main');
    });

    it('Preset de outra Conta, ou id inválido, não existe', async () => {
      const owner = await player({ vip: true });
      const other = await player({ vip: true });
      const preset = ok(await owner.createPreset({ name: 'Meu' }), presetSchema.parse, 201);

      const responses = [
        await other.activate(preset.id),
        await other.loadout(preset.id),
        await other.renamePreset('123', 'x'),
      ];

      expect(responses.map((r) => [r.statusCode, errorOf(r).code])).toEqual([
        [404, 'preset_not_found'],
        [404, 'preset_not_found'],
        [404, 'preset_not_found'],
      ]);
    });

    describe('sem Período VIP ativo', () => {
      it('os extras ficam somente leitura; o ativo continua sendo o Loadout', async () => {
        const p = await player({ vip: true });
        const ak = await p.add({ id: AK_REDLINE });
        const extra = ok(await p.createPreset({ name: 'Extra' }), presetSchema.parse, 201);
        await p.activate(extra.id);
        await p.equip({ uid: ak });
        await endVip(p.account.id);

        const list = await presetsOf(p);
        const loadout = await loadoutOf(p);
        const blocked = [
          await p.equip({ uid: ak }),
          await p.unequip({ slot: 'weapon_ak47' }),
          await p.renamePreset(extra.id, 'Outro'),
          await p.deletePreset(extra.id),
        ];

        expect(list.limit).toBe(1);
        expect(list.presets.map((x) => [x.main, x.active, x.readOnly, x.readOnlyReason])).toEqual([
          [true, false, false, null],
          [false, true, true, 'vip_inactive'],
        ]);
        expect(loadout).toMatchObject({ presetId: extra.id, readOnly: true, active: true });
        expect(equippedIn(loadout)).toEqual({ 'weapon_ak47:t': ak });
        expect(blocked.map((r) => [r.statusCode, errorOf(r).code])).toEqual([
          [403, 'preset_read_only'],
          [403, 'preset_read_only'],
          [403, 'preset_read_only'],
          [403, 'preset_read_only'],
        ]);
      });

      it('ativar o principal volta a permitir editar o Loadout', async () => {
        const p = await player({ vip: true });
        const ak = await p.add({ id: AK_REDLINE });
        const extra = ok(await p.createPreset({ name: 'Extra' }), presetSchema.parse, 201);
        await p.activate(extra.id);
        await endVip(p.account.id);
        const mainId = (await presetsOf(p)).presets[0]?.id as string;

        const activateExtra = await p.activate(extra.id);
        const activateMain = await p.activate(mainId);
        const equip = await p.equip({ uid: ak });

        expect(activateExtra.statusCode).toBe(403);
        expect(activateMain.statusCode).toBe(200);
        expect(equip.statusCode).toBe(200);
      });
    });
  });

  describe('usos do Item', () => {
    it('lista os slots do Loadout e os outros Presets em que o Item está', async () => {
      const p = await player({ vip: true });
      const deagle = await p.add({ id: DEAGLE });
      await p.equip({ uid: deagle });
      const extra = ok(await p.createPreset({ name: 'Extra' }), presetSchema.parse, 201);
      await p.unequip({ slot: 'weapon_deagle', sides: ['ct'], presetId: extra.id });

      const usages = ok(await p.usages(deagle), itemUsagesSchema.parse);

      expect(usages).toEqual({
        loadout: [
          { slot: 'weapon_deagle', side: 'ct' },
          { slot: 'weapon_deagle', side: 't' },
        ],
        presets: [{ id: extra.id, name: 'Extra', slots: [{ slot: 'weapon_deagle', side: 't' }] }],
      });
    });

    it('remover desequipa e lista onde estava; Desfazer reequipa nos mesmos slots', async () => {
      const p = await player({ vip: true });
      const deagle = await p.add({ id: DEAGLE });
      await p.equip({ uid: deagle });
      const extra = ok(await p.createPreset({ name: 'Extra' }), presetSchema.parse, 201);

      const removed = ok(await p.remove(deagle), removedInventoryItemSchema.parse);
      const afterRemove = [await loadoutOf(p), await loadoutOf(p, extra.id)];
      expect((await p.restore(deagle)).statusCode).toBe(200);
      const afterRestore = [await loadoutOf(p), await loadoutOf(p, extra.id)];

      expect(removed.usages.loadout).toHaveLength(2);
      expect(removed.usages.presets.map((x) => x.id)).toEqual([extra.id]);
      expect(afterRemove.map(equippedIn)).toEqual([{}, {}]);
      expect((await presetsOf(p)).presets.map((x) => x.equippedCount)).toEqual([2, 2]);
      expect(afterRestore.map(equippedIn)).toEqual([
        { 'weapon_deagle:ct': deagle, 'weapon_deagle:t': deagle },
        { 'weapon_deagle:ct': deagle, 'weapon_deagle:t': deagle },
      ]);
    });

    it('um slot ocupado por outro Item no meio-tempo fica com ele depois do Desfazer', async () => {
      const p = await player();
      const first = await p.add({ id: AK_REDLINE, wear: 0.2 });
      const second = await p.add({ id: AK_REDLINE, wear: 0.3 });
      await p.equip({ uid: first });

      await p.remove(first);
      await p.equip({ uid: second });
      await p.restore(first);

      expect(equippedIn(await loadoutOf(p))).toEqual({ 'weapon_ak47:t': second });
    });
  });

  describe('Perfil', () => {
    it('a vitrine mostra o Loadout que vai para o jogo, sem os atributos VIP sem VIP', async () => {
      const p = await player({ vip: true });
      const ak = await p.add({ id: AK_REDLINE, wear: 0.15, statTrak: 0 });
      const agent = await p.add({ id: AGENT_T });
      await p.equip({ uid: ak });
      await p.equip({ uid: agent });
      const me = currentSessionSchema.parse((await p.call('GET', '/api/me')).json());
      await endVip(p.account.id);

      const profile = profileSchema.parse(
        (await t.app.inject({ url: `/api/profiles/${p.account.publicId}` })).json(),
      );

      expect(me.account.loadoutShowcase.items).toEqual([
        { slot: 'weapon_ak47', side: 't', item: { id: AK_REDLINE, wear: 0.15, statTrak: 0 } },
        { slot: 'agent', side: 't', item: { id: AGENT_T } },
      ]);
      expect(profile.loadoutShowcase.items).toEqual([
        { slot: 'weapon_ak47', side: 't', item: { id: AK_REDLINE, wear: 0.15 } },
      ]);
    });
  });
});
