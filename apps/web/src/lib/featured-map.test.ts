import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURED_MAP, featuredMap } from './featured-map';

const server = (map: string | null, players: number, state = 'online') => ({ map, state, players });

describe('featuredMap', () => {
  it('é o mapa do servidor com mais gente', () => {
    expect(
      featuredMap([server('de_mirage', 4), server('de_dust2', 11), server('de_inferno', 2)]),
    ).toBe('dust2');
  });

  it('ignora servidor offline, sem mapa e mapa sem arte', () => {
    expect(
      featuredMap([
        server('de_nuke', 30, 'offline'),
        server(null, 20),
        server('de_vertigo', 18),
        server('de_inferno', 1),
      ]),
    ).toBe('inferno');
  });

  it('empate fica com o primeiro da lista', () => {
    expect(featuredMap([server('de_anubis', 5), server('de_ancient', 5)])).toBe('anubis');
  });

  it('sem servidor jogando, ou sem API, vale o padrão', () => {
    expect(featuredMap([])).toBe(DEFAULT_FEATURED_MAP);
    expect(featuredMap(null)).toBe(DEFAULT_FEATURED_MAP);
    expect(featuredMap([server('de_mirage', 0, 'offline')])).toBe(DEFAULT_FEATURED_MAP);
  });
});
