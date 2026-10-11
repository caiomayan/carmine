import { describe, expect, it } from 'vitest';
import { Catalog } from './catalog.js';

const catalog = new Catalog();

/** Ids do catálogo da cs2-lib 9.5.0. */
const AK_REDLINE = 222;
const AGENT_T = 8620;
const MUSIC_KIT = 1780;
const STICKER = 1847;

describe('Catalog.slots', () => {
  const slots = catalog.slots();
  const keys = slots.map(({ slot, side }) => `${slot}:${side}`);

  it('começa pela faca e pelas luvas, um slot por lado, e termina no music kit sem lado', () => {
    expect(keys.slice(0, 4)).toEqual(['knife:ct', 'knife:t', 'gloves:ct', 'gloves:t']);
    expect(keys.slice(-3)).toEqual(['agent:ct', 'agent:t', 'musicKit:null']);
  });

  it('cada arma com skin tem um slot nos lados em que existe, com o def do jogo', () => {
    expect(slots.filter((s) => s.slot === 'weapon_ak47')).toEqual([
      { slot: 'weapon_ak47', side: 't', group: 'rifle', def: 7 },
    ]);
    expect(keys).toContain('weapon_m4a1_silencer:ct');
    expect(keys).toContain('weapon_deagle:ct');
    expect(keys).toContain('weapon_deagle:t');
    expect(keys).toContain('weapon_taser:t');
  });

  it('armas sem skin no jogo (a C4) não têm slot', () => {
    expect(keys.some((key) => key.startsWith('weapon_c4'))).toBe(false);
  });

  it('as armas vêm agrupadas: pistolas, SMGs, rifles, pesadas e equipamento', () => {
    const groups = [...new Set(slots.map((s) => s.group))];

    expect(groups).toEqual([
      'knife',
      'gloves',
      'secondary',
      'smg',
      'rifle',
      'heavy',
      'equipment',
      'agent',
      'musicKit',
    ]);
  });
});

describe('Catalog.slotOf', () => {
  it('acha o slot e os lados de um Item do Inventário', () => {
    expect(catalog.slotOf(AK_REDLINE)).toEqual({ slot: 'weapon_ak47', sides: ['t'] });
    expect(catalog.slotOf(AGENT_T)).toEqual({ slot: 'agent', sides: ['t'] });
    expect(catalog.slotOf(MUSIC_KIT)).toEqual({ slot: 'musicKit', sides: null });
  });

  it('o que não se equipa não tem slot', () => {
    expect(catalog.slotOf(STICKER)).toBeNull();
    expect(catalog.slotOf(999_999_999)).toBeNull();
  });
});
