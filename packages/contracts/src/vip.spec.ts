import { describe, expect, it } from 'vitest';
import { vipFeaturesOf } from './vip.js';

describe('vipFeaturesOf', () => {
  it('skin de arma sem StatTrak nem nametag é do plano grátis', () => {
    expect(vipFeaturesOf('weapon', { statTrak: undefined, nameTag: undefined })).toEqual([]);
  });

  it('agentes e music kits são VIP', () => {
    expect(vipFeaturesOf('agent', {})).toEqual(['agent']);
    expect(vipFeaturesOf('musickit', {})).toEqual(['musicKit']);
  });

  it('StatTrak e nametag são VIP em qualquer Item', () => {
    expect(vipFeaturesOf('melee', { statTrak: 0, nameTag: 'faca' })).toEqual([
      'statTrak',
      'nameTag',
    ]);
  });
});
