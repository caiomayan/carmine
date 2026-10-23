import { describe, expect, it } from 'vitest';
import { CHARM_SLOTS, charmPlacement, charmSlotPosition } from './charm-slots';

// Limites reais da AK-47 na cs2-lib (getKeychainPositionBounds).
const AK = {
  x: { min: -11.0706, max: 24.7254 },
  y: { min: -0.0194, max: 1.0222 },
  z: { min: -2.7949, max: 4.28 },
};

describe('slots do chaveiro', () => {
  it('são cinco, do começo ao fim da arma, com os extremos nos limites', () => {
    expect(CHARM_SLOTS).toBe(5);
    expect(charmSlotPosition(AK, 0).x).toBe(AK.x.min);
    expect(charmSlotPosition(AK, CHARM_SLOTS - 1).x).toBe(AK.x.max);
  });

  it('espaçam o X por igual e mantêm Y e Z no meio da faixa', () => {
    const xs = Array.from({ length: CHARM_SLOTS }, (_, slot) => charmSlotPosition(AK, slot).x);
    const gaps = xs.slice(1).map((x, i) => Number((x - (xs[i] as number)).toFixed(3)));
    expect(new Set(gaps).size).toBe(1);
    const middle = charmSlotPosition(AK, 2);
    expect(middle.y).toBeCloseTo((AK.y.min + AK.y.max) / 2, 4);
    expect(middle.z).toBeCloseTo((AK.z.min + AK.z.max) / 2, 4);
  });

  it('arredonda a 4 casas, como o item guarda', () => {
    const { x, y, z } = charmSlotPosition(AK, 1);
    for (const value of [x, y, z]) expect(value).toBe(Number(value.toFixed(4)));
  });

  it('um slot fora do intervalo vira o mais próximo', () => {
    expect(charmSlotPosition(AK, -3)).toEqual(charmSlotPosition(AK, 0));
    expect(charmSlotPosition(AK, 99)).toEqual(charmSlotPosition(AK, CHARM_SLOTS - 1));
  });
});

describe('posição do chaveiro no editor', () => {
  it('sem posição guardada, é o padrão da arma', () => {
    expect(charmPlacement(AK, {})).toEqual({ kind: 'default' });
    expect(charmPlacement(AK, { x: 1 })).toEqual({ kind: 'default' });
  });

  it('a posição de um slot é reconhecida como esse slot', () => {
    for (let slot = 0; slot < CHARM_SLOTS; slot++) {
      expect(charmPlacement(AK, charmSlotPosition(AK, slot))).toEqual({ kind: 'slot', slot });
    }
  });

  it('qualquer outra posição é personalizada (arrastada no 3D ou ajustada)', () => {
    const slot = charmSlotPosition(AK, 2);
    expect(charmPlacement(AK, { ...slot, x: slot.x + 0.5 })).toEqual({ kind: 'custom' });
    expect(charmPlacement(AK, { ...slot, z: slot.z + 1 })).toEqual({ kind: 'custom' });
  });

  it('o menor passo do ajuste fino (0,0001) já tira o chaveiro do slot', () => {
    const slot = charmSlotPosition(AK, 0);
    expect(charmPlacement(AK, { ...slot, x: slot.x + 0.0001 })).toEqual({ kind: 'custom' });
  });
});
