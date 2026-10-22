import { describe, expect, it } from 'vitest';
import {
  PLAYER_SEARCH_LIMIT,
  PLAYER_SEARCH_MAX_LENGTH,
  PLAYER_SEARCH_MIN_LENGTH,
  playerSearchQuerySchema,
  playerSearchSchema,
} from './player-search.js';

describe('playerSearchSchema', () => {
  it('aceita jogadores com o avatar neutro ou o da Steam', () => {
    const result = {
      players: [
        { publicId: 10_016, displayName: 'coldzera', avatarUrl: null },
        {
          publicId: 10_017,
          displayName: 'Alfredo',
          avatarUrl: 'https://avatars.steamstatic.com/a.jpg',
        },
      ],
    };

    expect(playerSearchSchema.parse(result)).toEqual(result);
  });

  it('descarta o que não é do resultado (nada de SteamID64 por acidente)', () => {
    const parsed = playerSearchSchema.parse({
      players: [
        {
          publicId: 10_016,
          displayName: 'coldzera',
          avatarUrl: null,
          steamId: '76561198000000001',
        },
      ],
    });

    expect(parsed.players[0]).not.toHaveProperty('steamId');
  });
});

describe('playerSearchQuerySchema', () => {
  it('apara os espaços das pontas', () => {
    expect(playerSearchQuerySchema.parse({ q: '  cold  ' })).toEqual({ q: 'cold' });
  });

  it('exige o mínimo de letras e recusa o excesso', () => {
    expect(
      playerSearchQuerySchema.safeParse({ q: 'a'.repeat(PLAYER_SEARCH_MIN_LENGTH - 1) }).success,
    ).toBe(false);
    expect(playerSearchQuerySchema.safeParse({ q: ' a ' }).success).toBe(false);
    expect(playerSearchQuerySchema.safeParse({ q: 'ab' }).success).toBe(true);
    expect(
      playerSearchQuerySchema.safeParse({ q: 'a'.repeat(PLAYER_SEARCH_MAX_LENGTH + 1) }).success,
    ).toBe(false);
    expect(playerSearchQuerySchema.safeParse({}).success).toBe(false);
  });

  it('mostra poucos resultados por busca', () => {
    expect(PLAYER_SEARCH_LIMIT).toBe(8);
  });
});
