import { STAT_WEAPONS } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { normalizeWeapon } from './weapons.js';

describe('normalizeWeapon', () => {
  it('mantém as armas conhecidas', () => {
    for (const weapon of STAT_WEAPONS) {
      if (weapon !== 'other') expect(normalizeWeapon(weapon), weapon).toBe(weapon);
    }
  });

  it('tira o prefixo weapon_ e as maiúsculas', () => {
    expect(normalizeWeapon('weapon_ak47')).toBe('ak47');
    expect(normalizeWeapon('  AWP ')).toBe('awp');
  });

  it('junta os aliases do jogo', () => {
    expect(normalizeWeapon('hkp2000')).toBe('p2000');
    expect(normalizeWeapon('sg553')).toBe('sg556');
    expect(normalizeWeapon('inferno')).toBe('molotov');
    expect(normalizeWeapon('incgrenade')).toBe('molotov');
  });

  it('mantém m4a1 e m4a1_silencer separadas', () => {
    expect(normalizeWeapon('m4a1')).toBe('m4a1');
    expect(normalizeWeapon('m4a1_silencer')).toBe('m4a1_silencer');
  });

  it('toda faca é knife', () => {
    for (const raw of ['knife', 'knife_t', 'weapon_knife_karambit', 'bayonet']) {
      expect(normalizeWeapon(raw), raw).toBe('knife');
    }
  });

  it('o que não conhece vira other, sem criar chave nova', () => {
    for (const raw of ['', 'planted_c4', 'world', 'decoy', 'arma-nova-do-jogo', '💥']) {
      expect(normalizeWeapon(raw), raw).toBe('other');
    }
  });
});
