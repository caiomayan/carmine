import { describe, expect, it } from 'vitest';
import { Catalog } from '../catalog/catalog.js';
import { isNotableSkin } from './notable-skin.js';

const catalog = new Catalog();
const all = [...catalog.economy.items.values()];

/** Ids da cs2-lib 9.5.0. */
const AK_REDLINE = 222;
const AWP_ASIIMOV = 306;
const KARAMBIT_VANILLA = 41;
const AGENT_T = 8620;
const MUSIC_KIT = 1780;
const STICKER = 1847;

const notable = (id: number) =>
  isNotableSkin(catalog.find(id) as NonNullable<ReturnType<Catalog['find']>>);

describe('isNotableSkin', () => {
  it('skin de arma rara (secreta, oculta, contrabando) vale o destaque', () => {
    expect(notable(AK_REDLINE)).toBe(true);
    expect(notable(AWP_ASIIMOV)).toBe(true);
  });

  it('skin de arma de raridade baixa não vale', () => {
    const common = all.find(
      (item) =>
        item.type === 'weapon' && !item.isDefault && !item.isBase && item.rarityColor === '#b0c3d9',
    );

    expect(common).toBeDefined();
    expect(isNotableSkin(common as NonNullable<typeof common>)).toBe(false);
  });

  it('faca e luvas pintadas valem, qualquer que seja a raridade', () => {
    const knife = all.find((item) => item.type === 'melee' && !item.isBase && !item.isDefault);
    const gloves = all.find((item) => item.type === 'glove' && !item.isBase && !item.isDefault);

    expect(isNotableSkin(knife as NonNullable<typeof knife>)).toBe(true);
    expect(isNotableSkin(gloves as NonNullable<typeof gloves>)).toBe(true);
  });

  it('o que não tem pintura não vale: faca lisa e a arma padrão', () => {
    const defaultWeapon = all.find((item) => item.type === 'weapon' && item.isDefault);

    expect(notable(KARAMBIT_VANILLA)).toBe(false);
    expect(isNotableSkin(defaultWeapon as NonNullable<typeof defaultWeapon>)).toBe(false);
  });

  it('agente, kit de música e adesivo não são skin', () => {
    expect(notable(AGENT_T)).toBe(false);
    expect(notable(MUSIC_KIT)).toBe(false);
    expect(notable(STICKER)).toBe(false);
  });
});
