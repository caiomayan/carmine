import type { CS2BaseInventoryItem } from '@ianlucas/cs2-lib';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  type Cs2Item,
  cs2ItemSchema,
  INVENTORY_ERROR_CODES,
  INVENTORY_ERROR_STATUS,
  inventoryErrorSchema,
  inventorySchema,
} from './inventory.js';

const ak = {
  id: 307,
  wear: 0.15,
  seed: 661,
  statTrak: 0,
  nameTag: 'Carmine',
  stickers: {
    '0': { id: 5_000, schema: 0, wear: 0.1, rotation: 12.5, x: 0.01, y: -0.02 },
    '1': { id: 5_001 },
  },
  keychains: { '0': { id: 9_000, seed: 42, x: 1, y: 2, z: 3 } },
};

describe('cs2ItemSchema', () => {
  it('aceita um Item com todos os atributos simulados', () => {
    expect(cs2ItemSchema.parse(ak)).toEqual(ak);
  });

  it('é o CS2BaseInventoryItem da cs2-lib, sem campos a mais', () => {
    expectTypeOf<Cs2Item>().toExtend<CS2BaseInventoryItem>();
  });

  it.each([
    ['campo do Loadout', { id: 307, equipped: true }],
    ['patches', { id: 307, patches: { '0': 1 } }],
    ['float acima de 1', { id: 307, wear: 1.5 }],
    ['float com mais de 6 casas', { id: 307, wear: 0.1 + 0.2 }],
    ['seed fracionário', { id: 307, seed: 1.5 }],
    ['StatTrak negativo', { id: 307, statTrak: -1 }],
    ['nametag vazio', { id: 307, nameTag: '' }],
    ['chave de sticker que não é índice', { id: 307, stickers: { a: { id: 1 } } }],
    ['campo desconhecido no sticker', { id: 307, stickers: { '0': { id: 1, foo: 1 } } }],
    ['id zero', { id: 0 }],
  ])('recusa %s', (_, item) => {
    expect(cs2ItemSchema.safeParse(item).success).toBe(false);
  });
});

describe('inventorySchema', () => {
  it('lista os Itens com uid estável e o limite', () => {
    const inventory = {
      items: [
        {
          uid: '0b9f3c1e-5a43-4c8e-9d7e-2f1a6b3c4d5e',
          item: ak,
          createdAt: '2026-10-11T10:00:00.000Z',
          updatedAt: '2026-10-11T10:05:00.000Z',
        },
      ],
      limit: 300,
    };

    expect(inventorySchema.parse(inventory)).toEqual(inventory);
  });
});

describe('erros do Inventário', () => {
  it('todo código tem um status HTTP', () => {
    expect(Object.keys(INVENTORY_ERROR_STATUS).sort()).toEqual([...INVENTORY_ERROR_CODES].sort());
  });

  it('o corpo traz o código, o campo e a faixa', () => {
    const error = {
      statusCode: 422,
      code: 'wear_out_of_range',
      message: 'Float fora da faixa da skin',
      field: 'wear',
      range: { min: 0, max: 0.08 },
    };

    expect(inventoryErrorSchema.parse(error)).toEqual(error);
    expect(inventoryErrorSchema.safeParse({ ...error, code: 'outro' }).success).toBe(false);
  });
});
