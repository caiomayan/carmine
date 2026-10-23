import { describe, expect, it } from 'vitest';
import { toCard } from './cards';

const owned = (item: Parameters<typeof toCard>[0]['item']) => ({
  uid: 'u1',
  item,
  createdAt: '',
  updatedAt: '',
});

describe('toCard', () => {
  it('leva os stickers na ordem dos slots e o chaveiro, com nome e imagem', () => {
    const card = toCard(
      owned({
        id: 222,
        wear: 0.12,
        stickers: {
          '1': { id: 1948, schema: 1 },
          '0': { id: 1947, schema: 0 },
        },
        keychains: { '0': { id: 13113, seed: 5 } },
      }),
    );
    expect(card.stickers.map((sticker) => sticker.id)).toEqual([1947, 1948]);
    expect(card.stickers[0]?.name).toContain('Adesivo');
    expect(card.stickers[0]?.image).toMatch(/^https?:\/\//);
    expect(card.charm).toMatchObject({ id: 13113, name: 'Chaveiro | Pequena Ava' });
    expect(card.charm?.image).toMatch(/^https?:\/\//);
  });

  it('sem stickers nem chaveiro, nada de ícones', () => {
    const card = toCard(owned({ id: 222 }));
    expect(card.stickers).toEqual([]);
    expect(card.charm).toBeNull();
  });

  it('sticker fora do catálogo continua no cartão, sem imagem', () => {
    const card = toCard(owned({ id: 222, stickers: { '0': { id: 999999999, schema: 0 } } }));
    expect(card.stickers).toEqual([{ id: 999999999, name: '#999999999', image: '' }]);
  });
});
