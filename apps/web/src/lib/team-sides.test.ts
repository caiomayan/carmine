import { describe, expect, it } from 'vitest';
import { orderedSides } from './team-sides';

describe('orderedSides', () => {
  it('põe o TR à esquerda e o CT à direita, qualquer que seja a ordem de entrada', () => {
    expect(orderedSides(['ct', 't'])).toEqual(['t', 'ct']);
    expect(orderedSides(['t', 'ct'])).toEqual(['t', 'ct']);
  });

  it('não repete lados', () => {
    expect(orderedSides(['ct', 'ct', 't', 't'])).toEqual(['t', 'ct']);
  });

  it('mantém só o lado que existe e devolve vazio sem lados', () => {
    expect(orderedSides(['ct'])).toEqual(['ct']);
    expect(orderedSides(['t'])).toEqual(['t']);
    expect(orderedSides([])).toEqual([]);
  });
});
