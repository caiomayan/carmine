import { describe, expect, it } from 'vitest';
import { inkOn, mapVars } from './map-colors';

describe('inkOn', () => {
  it('cor clara leva tinta escura, cor escura leva branco', () => {
    expect(inkOn('#e8b04f')).toBe('#0b0b0b');
    expect(inkOn('#ffffff')).toBe('#0b0b0b');
    expect(inkOn('#0b5668')).toBe('#ffffff');
    expect(inkOn('#222')).toBe('#ffffff');
  });

  it('cor que não entende vira tinta escura', () => {
    expect(inkOn('rebeccapurple')).toBe('#0b0b0b');
  });
});

describe('mapVars', () => {
  it('usa a primeira cor como a do mapa e a terceira (ou a segunda) para o fundo do cartão', () => {
    const vars = mapVars(['#e8b04f', '#8a5a14', '#3a2a10']);
    expect(vars['--v-map']).toBe('#e8b04f');
    expect(vars['--v-map-deep']).toBe('color-mix(in srgb, #3a2a10 52%, #000)');
    expect(vars['--v-map-ink']).toBe('#0b0b0b');
    expect(mapVars(['#e8b04f', '#8a5a14'])['--v-map-deep']).toContain('#8a5a14');
  });

  it('sem cores, um neutro com tinta legível', () => {
    const vars = mapVars(null);
    expect(vars['--v-map']).toBe('#8a8a8a');
    expect(vars['--v-map-ink']).toBe('#0b0b0b');
  });
});
