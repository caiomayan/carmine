import { describe, expect, it } from 'vitest';
import { ambientFor, holoStyle } from './skin-ambient';

const RARITY = 'var(--rarity-covert)';

describe('ambientFor: a cor ambiente da skin', () => {
  it('usa as duas primeiras cores da paleta e fecha com a cor do lado', () => {
    expect(ambientFor(['#c750b4', '#4192c7', '#d2a160'], RARITY, 'var(--side-t)')).toEqual([
      '#c750b4',
      '#4192c7',
      'var(--side-t)',
    ]);
  });

  it('com uma cor só, repete essa cor', () => {
    expect(ambientFor(['#c750b4'], RARITY, 'var(--side-ct)')).toEqual([
      '#c750b4',
      '#c750b4',
      'var(--side-ct)',
    ]);
  });

  it('sem paleta cai na cor da raridade, e sem raridade no cinza de apoio', () => {
    expect(ambientFor(null, RARITY, 'var(--side-ct)')).toEqual([RARITY, RARITY, 'var(--side-ct)']);
    expect(ambientFor(undefined, undefined, 'var(--side-t)')).toEqual([
      'var(--muted)',
      'var(--muted)',
      'var(--side-t)',
    ]);
  });
});

describe('holoStyle: brilho metálico tingido pela skin, nunca o arco-íris', () => {
  it('monta o gradiente com as cores da própria skin', () => {
    expect(holoStyle(['#c750b4', '#4192c7', '#d2a160'], RARITY)).toEqual({
      '--h0': '#c750b4',
      '--h1': '#c750b4',
      '--h2': '#4192c7',
      '--h3': '#d2a160',
    });
  });

  it('completa as cores que faltam com a primeira e, sem paleta, com a cor da raridade', () => {
    expect(holoStyle(['#c750b4'], RARITY)).toMatchObject({
      '--h1': '#c750b4',
      '--h2': '#c750b4',
      '--h3': '#c750b4',
    });
    expect(holoStyle(null, RARITY)).toEqual({
      '--h0': RARITY,
      '--h1': RARITY,
      '--h2': RARITY,
      '--h3': RARITY,
    });
  });

  it('StatTrak troca o gradiente por âmbar metálico e guarda a cor da skin em --h0', () => {
    const style = holoStyle(['#4192c7', '#c750b4'], RARITY, { statTrak: true });
    expect(style['--h0']).toBe('#4192c7');
    expect([style['--h1'], style['--h2'], style['--h3']]).toEqual([
      '#ff9a2e',
      '#ffc873',
      '#e0701a',
    ]);
  });
});
