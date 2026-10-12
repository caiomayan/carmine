import { describe, expect, it } from 'vitest';
import { slotDefault, slotOfItem } from './slots';

// Ids da @ianlucas/cs2-lib 9.5.0 (fixada no package.json).
const AK_REDLINE = 222;
const AWP_ASIIMOV = 306;
const USP_KILL_CONFIRMED = 1139;
const KARAMBIT_FADE = 1327;
const FIRST_GLOVES = 1707;
const FIRST_AGENT = 8620;
const MUSIC_KIT = 1781;
const STICKER = 1847;
const DEAGLE_DEFAULT = 0;

describe('slot de um Item do catálogo', () => {
  it('uma skin de arma vai no slot da arma, só nos lados em que ela existe', () => {
    expect(slotOfItem(AK_REDLINE)).toEqual({ slot: 'weapon_ak47', sides: ['t'] });
    expect(slotOfItem(USP_KILL_CONFIRMED)).toEqual({ slot: 'weapon_usp_silencer', sides: ['ct'] });
    expect(slotOfItem(AWP_ASIIMOV)).toEqual({ slot: 'weapon_awp', sides: ['ct', 't'] });
  });

  it('faca e luvas valem nos dois lados; o agente, só no time dele', () => {
    expect(slotOfItem(KARAMBIT_FADE)).toEqual({ slot: 'knife', sides: ['ct', 't'] });
    expect(slotOfItem(FIRST_GLOVES)).toEqual({ slot: 'gloves', sides: ['ct', 't'] });
    expect(slotOfItem(FIRST_AGENT)).toEqual({ slot: 'agent', sides: ['t'] });
  });

  it('o music kit não tem lado', () => {
    expect(slotOfItem(MUSIC_KIT)).toEqual({ slot: 'musicKit', sides: null });
  });

  it('o que não é Item não tem slot', () => {
    expect(slotOfItem(STICKER)).toBeNull();
    expect(slotOfItem(DEAGLE_DEFAULT)).toBeNull();
    expect(slotOfItem(999_999_999)).toBeNull();
  });
});

describe('Arma padrão de um slot vazio', () => {
  it('a arma do slot, com a imagem dela', () => {
    expect(slotDefault('weapon_ak47', 't')).toEqual({
      name: 'AK-47',
      image: expect.stringMatching(/weapon_ak47/),
    });
  });

  it('a faca e as luvas padrão são as do lado', () => {
    expect(slotDefault('knife', 't').image).toMatch(/weapon_knife_t_/);
    expect(slotDefault('knife', 'ct').image).toMatch(/weapon_knife_[0-9a-f]/);
    expect(slotDefault('gloves', 'ct').image).toMatch(/ct_gloves/);
  });

  it('o agente padrão não tem imagem; o music kit padrão é o do CS2', () => {
    expect(slotDefault('agent', 'ct')).toEqual({ name: null, image: null });
    expect(slotDefault('musicKit', null).name).toMatch(/Counter-Strike 2/);
  });
});
