import { describe, expect, it } from 'vitest';
import { equippedV5Schema } from './equipped.js';

describe('equippedV5Schema', () => {
  it('aceita o Loadout vazio (só Armas padrão)', () => {
    const empty = { agents: {}, ctWeapons: {}, gloves: {}, knives: {}, tWeapons: {} };

    expect(equippedV5Schema.parse(empty)).toEqual(empty);
  });

  it('aceita uma arma equipada no formato do plugin', () => {
    const equipped = {
      ctWeapons: {
        '7': {
          def: 7,
          hash: 'abc',
          nametag: '',
          paint: 44,
          seed: 661,
          stattrak: -1,
          stickers: [{ def: 1, slot: 0, wear: 0 }],
          keychains: [],
          uid: 1,
          wear: 0.15,
        },
      },
    };

    expect(equippedV5Schema.parse(equipped)).toEqual(equipped);
  });

  it('rejeita chave de mapa que não é número', () => {
    expect(equippedV5Schema.safeParse({ knives: { ct: {} } }).success).toBe(false);
  });
});
