import { equippedV5Schema } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { Catalog } from '../catalog/catalog.js';
import { type EquippedItem, toEquippedV5 } from './equipped-v5.js';

const catalog = new Catalog();

/** Ids do catálogo da cs2-lib 9.5.0 (def/paint da Valve entre parênteses). */
const AK_REDLINE = 222; // def 7, paint 282, float mínimo 0,10
const DEAGLE = 66; // def 1, paint 17, CT e TR
const BAYONET_SKIN = 1211; // def 500, paint 5
const VANILLA_BAYONET = 37; // def 500, paint 0, sem float
const GLOVES = 1707; // def 4725, paint 10085
const AGENT_T = 8620; // def 5105
const AGENT_CT = 8629; // def 5305
const MUSIC_KIT = 1780; // music id 3
const STICKER = 1847; // sticker id 1
const CHARM_WITH_STICKER = 15407; // keychain 37, com o sticker 1

const vip = { vip: true };
const free = { vip: false };

let nextUid = 1;
const equipped = (
  slot: string,
  side: EquippedItem['side'],
  item: EquippedItem['item'],
): EquippedItem => ({ slot, side, item, econUid: nextUid++ });

describe('toEquippedV5', () => {
  it('sem nada equipado, devolve os mapas vazios e nenhum music kit', () => {
    const body = toEquippedV5([], catalog, vip);

    expect(JSON.stringify(body)).toBe(
      '{"agents":{},"ctWeapons":{},"gloves":{},"knives":{},"tWeapons":{}}',
    );
  });

  it('skin de arma: def, paint, float, seed, StatTrak, nametag, stickers e charm', () => {
    const ak = equipped('weapon_ak47', 't', {
      id: AK_REDLINE,
      wear: 0.15,
      seed: 661,
      statTrak: 12,
      nameTag: 'Carmine',
      stickers: {
        '0': { id: STICKER, schema: 0, wear: 0.1, rotation: 15 },
        '2': { id: STICKER, x: 0.1, y: 0.05 },
      },
      keychains: { '0': { id: CHARM_WITH_STICKER, seed: 42, x: 1, y: 0.5, z: 0.2 } },
    });

    const body = toEquippedV5([ak], catalog, vip);

    expect(body.ctWeapons).toEqual({});
    expect(body.tWeapons?.['7']).toEqual({
      def: 7,
      hash: expect.stringMatching(/^[0-9a-f]{7}$/),
      nametag: 'Carmine',
      paint: 282,
      seed: 661,
      stattrak: 12,
      stickers: [
        { def: 1, rotation: 15, schema: 0, slot: 0, wear: 0.1 },
        { def: 1, slot: 2, wear: 0, x: 0.1, y: 0.05 },
      ],
      keychains: [{ def: 37, seed: 42, slot: 0, sticker: 1, x: 1, y: 0.5, z: 0.2 }],
      uid: ak.econUid,
      wear: 0.15,
    });
    expect(equippedV5Schema.safeParse(body).success).toBe(true);
  });

  it('sem atributos, usa os padrões do jogo: float mínimo da skin, seed 1, sem StatTrak', () => {
    const body = toEquippedV5([equipped('weapon_ak47', 't', { id: AK_REDLINE })], catalog, vip);

    expect(body.tWeapons?.['7']).toMatchObject({
      nametag: '',
      seed: 1,
      stattrak: -1,
      stickers: [],
      keychains: [],
      wear: 0.1,
    });
  });

  it('a mesma arma nos dois lados vai para ctWeapons e tWeapons', () => {
    const deagle = { id: DEAGLE, wear: 0.2 };
    const body = toEquippedV5(
      [equipped('weapon_deagle', 'ct', deagle), equipped('weapon_deagle', 't', deagle)],
      catalog,
      vip,
    );

    expect(body.ctWeapons?.['1']?.paint).toBe(17);
    expect(body.tWeapons?.['1']?.paint).toBe(17);
  });

  it('faca, luvas e agente vão por time (2 = TR, 3 = CT)', () => {
    const body = toEquippedV5(
      [
        equipped('knife', 'ct', { id: BAYONET_SKIN, wear: 0.07, seed: 3, statTrak: 0 }),
        equipped('knife', 't', { id: VANILLA_BAYONET }),
        equipped('gloves', 'ct', { id: GLOVES, wear: 0.5, seed: 9 }),
        equipped('gloves', 't', { id: GLOVES, wear: 0.5, seed: 9 }),
        equipped('agent', 'ct', { id: AGENT_CT }),
        equipped('agent', 't', { id: AGENT_T }),
      ],
      catalog,
      vip,
    );

    expect(body.knives?.['3']).toMatchObject({
      def: 500,
      paint: 5,
      seed: 3,
      stattrak: 0,
      stickers: [],
      wear: 0.07,
    });
    expect(body.knives?.['2']).toMatchObject({ def: 500, paint: 0, seed: 1, wear: 0 });
    expect(body.gloves?.['3']).toEqual({
      def: 4725,
      hash: expect.any(String),
      paint: 10085,
      seed: 9,
      wear: 0.5,
    });
    expect(Object.keys(body.gloves ?? {})).toEqual(['2', '3']);
    expect(body.agents).toEqual({
      '2': { def: 5105, hash: expect.any(String), stickers: [] },
      '3': { def: 5305, hash: expect.any(String), stickers: [] },
    });
    expect(equippedV5Schema.safeParse(body).success).toBe(true);
  });

  it('music kit: music id, StatTrak e uid', () => {
    const kit = equipped('musicKit', null, { id: MUSIC_KIT, statTrak: 5 });

    expect(toEquippedV5([kit], catalog, vip).musicKit).toEqual({
      musicId: 3,
      stattrak: 5,
      uid: kit.econUid,
    });
  });

  it('o hash muda quando o Item muda, e só então', () => {
    const hashOf = (wear: number) =>
      toEquippedV5([equipped('weapon_ak47', 't', { id: AK_REDLINE, wear })], catalog, vip)
        .tWeapons?.['7']?.hash;
    const ak = equipped('weapon_ak47', 't', { id: AK_REDLINE, wear: 0.2 });
    const twice = [toEquippedV5([ak], catalog, vip), toEquippedV5([ak], catalog, vip)];

    expect(twice[0]?.tWeapons?.['7']?.hash).toBe(twice[1]?.tWeapons?.['7']?.hash);
    expect(hashOf(0.2)).not.toBe(hashOf(0.3));
  });

  describe('sem Período VIP ativo', () => {
    const items = [
      equipped('weapon_ak47', 't', { id: AK_REDLINE, statTrak: 3, nameTag: 'Carmine' }),
      equipped('knife', 't', { id: BAYONET_SKIN, statTrak: 0, nameTag: 'faca' }),
      equipped('agent', 't', { id: AGENT_T }),
      equipped('musicKit', null, { id: MUSIC_KIT, statTrak: 1 }),
    ];
    const body = toEquippedV5(items, catalog, free);

    it('agentes e music kits ficam fora', () => {
      expect(body.agents).toEqual({});
      expect(body.musicKit).toBeUndefined();
    });

    it('StatTrak e nametag saem do Item, que continua indo', () => {
      expect(body.tWeapons?.['7']).toMatchObject({ stattrak: -1, nametag: '', paint: 282 });
      expect(body.knives?.['2']).toMatchObject({ stattrak: -1, nametag: '' });
    });
  });
});
