import { describe, expect, it } from 'vitest';
import { imageForWear, wearGradient, wearSegments, wearTier } from './wear';

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

describe('fases dentro da faixa da skin', () => {
  it('uma skin de 0 a 1 divide a barra nos cortes do CS2', () => {
    const segments = wearSegments({ min: 0, max: 1 });
    expect(segments.map((s) => s.tier)).toEqual(['fn', 'mw', 'ft', 'ww', 'bs']);
    expect(segments.map((s) => Number(s.width.toFixed(2)))).toEqual([7, 8, 22, 7, 56]);
    expect(segments.reduce((sum, s) => sum + s.width, 0)).toBeCloseTo(100);
  });

  it('recorta a barra na faixa: só as fases que a skin alcança, somando 100%', () => {
    const segments = wearSegments({ min: 0.06, max: 0.8 });
    expect(segments.map((s) => s.tier)).toEqual(['fn', 'mw', 'ft', 'ww', 'bs']);
    expect(segments[0]?.width).toBeCloseTo((0.01 / 0.74) * 100);
    expect(segments.reduce((sum, s) => sum + s.width, 0)).toBeCloseTo(100);

    const floor = wearSegments({ min: 0.15, max: 0.38 });
    expect(floor.map((s) => s.tier)).toEqual(['ft', 'ww']);
    expect(floor.reduce((sum, s) => sum + s.width, 0)).toBeCloseTo(100);
  });

  it('faixa dentro de uma fase só tem essa fase', () => {
    expect(wearSegments({ min: 0, max: 0.07 })).toEqual([{ tier: 'fn', width: 100 }]);
    expect(wearSegments({ min: 0.45, max: 1 }).map((s) => s.tier)).toEqual(['bs']);
  });

  it('faixa vazia (min = max) devolve a fase daquele valor, sem dividir por zero', () => {
    expect(wearSegments({ min: 0.2, max: 0.2 })).toEqual([{ tier: 'ft', width: 100 }]);
  });
});

describe('gradiente das fases', () => {
  it('é uma faixa de paradas duras, uma cor de contexto por fase', () => {
    const css = wearGradient([
      { tier: 'fn', width: 25 },
      { tier: 'mw', width: 75 },
    ]);
    expect(css).toBe('linear-gradient(90deg, var(--wear-fn) 0% 25%, var(--wear-mw) 25% 100%)');
  });
});
