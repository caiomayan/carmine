import { describe, expect, it } from 'vitest';
import { equippedTeamSides, orderedSides } from './team-sides';

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

describe('equippedTeamSides', () => {
  it('traduz o lado sem time (kit de música) para os dois lados', () => {
    expect(equippedTeamSides([null])).toEqual(['t', 'ct']);
  });

  it('junta os lados dos slots em que o Item está, sem repetir', () => {
    expect(equippedTeamSides(['ct'])).toEqual(['ct']);
    expect(equippedTeamSides(['ct', 't', 'ct'])).toEqual(['t', 'ct']);
  });

  it('sem slots, sem lados', () => {
    expect(equippedTeamSides(undefined)).toEqual([]);
    expect(equippedTeamSides([])).toEqual([]);
  });
});
