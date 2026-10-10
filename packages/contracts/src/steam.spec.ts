import { describe, expect, it } from 'vitest';
import { steamId64Schema } from './steam.js';

describe('steamId64Schema', () => {
  it.each(['76561197960265729', '76561198000000000', '76561202255233023'])('aceita %s', (id) => {
    expect(steamId64Schema.parse(id)).toBe(id);
  });

  it.each([
    ['76561197960265728', 'abaixo da faixa individual'],
    ['76561202255233024', 'acima da faixa individual'],
    ['7656119800000000', '16 dígitos'],
    ['7656119800000000a', 'letra'],
    ['', 'vazio'],
  ])('rejeita %s (%s)', (id) => {
    expect(steamId64Schema.safeParse(id).success).toBe(false);
  });
});
