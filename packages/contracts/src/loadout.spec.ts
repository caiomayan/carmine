import { describe, expect, it } from 'vitest';
import {
  equipInputSchema,
  gameLimitationsOf,
  inGameOf,
  loadoutSlotOf,
  loadoutSlotSchema,
} from './loadout.js';

describe('loadoutSlotOf', () => {
  it('armas ficam no slot da classe do jogo, só nos lados em que existem', () => {
    expect(loadoutSlotOf({ type: 'weapon', modelKey: 'ak47', teams: [2] })).toEqual({
      slot: 'weapon_ak47',
      sides: ['t'],
    });
    expect(loadoutSlotOf({ type: 'weapon', modelKey: 'deagle', teams: [3, 2] })).toEqual({
      slot: 'weapon_deagle',
      sides: ['ct', 't'],
    });
  });

  it('faca, luvas e agente têm um slot por lado; o music kit não tem lado', () => {
    expect(loadoutSlotOf({ type: 'melee', modelKey: 'bayonet', teams: [2, 3] })).toEqual({
      slot: 'knife',
      sides: ['ct', 't'],
    });
    expect(loadoutSlotOf({ type: 'glove', teams: [2, 3] })?.slot).toBe('gloves');
    expect(loadoutSlotOf({ type: 'agent', teams: [3] })).toEqual({ slot: 'agent', sides: ['ct'] });
    expect(loadoutSlotOf({ type: 'musickit' })).toEqual({ slot: 'musicKit', sides: null });
  });

  it('o que não é Item equipável não tem slot', () => {
    expect(loadoutSlotOf({ type: 'sticker' })).toBeNull();
    expect(loadoutSlotOf({ type: 'keychain' })).toBeNull();
  });
});

describe('loadoutSlotSchema', () => {
  it('aceita os slots do Loadout e recusa o resto', () => {
    for (const slot of ['weapon_m4a1_silencer', 'knife', 'gloves', 'agent', 'musicKit']) {
      expect(loadoutSlotSchema.safeParse(slot).success).toBe(true);
    }
    for (const slot of ['ak47', 'weapon_', 'Knife', 'music_kit']) {
      expect(loadoutSlotSchema.safeParse(slot).success).toBe(false);
    }
  });
});

describe('inGameOf', () => {
  it('com VIP, tudo vai para o jogo', () => {
    expect(inGameOf('agent', {}, { vip: true })).toEqual({ notInGame: null, strippedInGame: [] });
    expect(inGameOf('weapon', { statTrak: 3, nameTag: 'x' }, { vip: true }).strippedInGame).toEqual(
      [],
    );
  });

  it('sem VIP, agentes e music kits ficam fora do jogo', () => {
    expect(inGameOf('agent', {}, { vip: false }).notInGame).toBe('vip_inactive');
    expect(inGameOf('musickit', { statTrak: 0 }, { vip: false }).notInGame).toBe('vip_inactive');
  });

  it('sem VIP, o Item vai sem StatTrak e sem nametag', () => {
    expect(inGameOf('melee', { statTrak: 0, nameTag: 'faca' }, { vip: false })).toEqual({
      notInGame: null,
      strippedInGame: ['statTrak', 'nameTag'],
    });
  });
});

describe('gameLimitationsOf', () => {
  it('avisa que o contador do StatTrak não sobe no jogo', () => {
    expect(gameLimitationsOf('weapon', { statTrak: 0 })).toEqual([
      { code: 'stattrak_not_counted', field: 'statTrak' },
    ]);
    expect(gameLimitationsOf('weapon', {})).toEqual([]);
  });
});

describe('equipInputSchema', () => {
  it('lados são opcionais, mas não vazios', () => {
    const uid = '0b9f6f9e-8c41-4bde-a1c6-3c6c7b6f3e10';

    expect(equipInputSchema.safeParse({ uid }).success).toBe(true);
    expect(equipInputSchema.safeParse({ uid, sides: ['ct', 't'] }).success).toBe(true);
    expect(equipInputSchema.safeParse({ uid, sides: [] }).success).toBe(false);
  });
});
