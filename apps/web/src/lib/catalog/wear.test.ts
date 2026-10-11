import { describe, expect, it } from 'vitest';
import { imageForWear, wearTier } from './wear';

describe('faixa de desgaste', () => {
  it('segue os cortes do CS2', () => {
    expect(wearTier(0)).toBe('fn');
    expect(wearTier(0.07)).toBe('fn');
    expect(wearTier(0.0700001)).toBe('mw');
    expect(wearTier(0.15)).toBe('mw');
    expect(wearTier(0.37)).toBe('ft');
    expect(wearTier(0.44)).toBe('ww');
    expect(wearTier(0.45)).toBe('bs');
  });
});

describe('imagem 2D pelo float', () => {
  const base = 'https://cdn.cstrike.app/images/weapon_ak47_cu_ak47_cobra_8a8119d8.webp';

  it('troca pela variante de desgaste, como a cs2-lib', () => {
    expect(imageForWear(base, 0.15)).toBe(base.replace('.webp', '_light.webp'));
    expect(imageForWear(base, 0.5)).toBe(base.replace('.webp', '_medium.webp'));
    expect(imageForWear(base, 0.9)).toBe(base.replace('.webp', '_heavy.webp'));
  });

  it('sem float, a imagem base', () => {
    expect(imageForWear(base, null)).toBe(base);
  });
});
