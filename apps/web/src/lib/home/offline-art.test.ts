import { describe, expect, it } from 'vitest';
import type { ArtPair } from '@/components/vida/map-art';
import { SLEEP_ART_MAP, sleepingArt } from './offline-art';

const pair = (id: string): ArtPair => {
  const choice = { id, night: false, colors: [], average: '#000' };
  return { day: choice, night: { ...choice, night: true } };
};
const table = { mirage: pair('mirage'), dust2: pair('dust2'), nuke: pair('nuke') };

describe('sleepingArt', () => {
  it('usa a arte do último mapa conhecido, com ou sem o prefixo do Modo', () => {
    expect(sleepingArt({ lastMap: 'de_nuke', mode: 'retake' }, table)).toEqual({
      slug: 'nuke',
      art: table.nuke,
      placeholder: false,
    });
  });

  it('sem mapa conhecido cai na arte do Modo, marcada como reserva', () => {
    expect(sleepingArt({ lastMap: null, mode: 'retake' }, table)).toEqual({
      slug: SLEEP_ART_MAP.retake,
      art: table.mirage,
      placeholder: true,
    });
    expect(sleepingArt({ lastMap: null, mode: 'deathmatch' }, table)?.slug).toBe('dust2');
  });

  it('um último mapa sem arte (fora da rotação) também cai na reserva', () => {
    expect(sleepingArt({ lastMap: 'de_workshop_x', mode: 'deathmatch' }, table)?.placeholder).toBe(
      true,
    );
  });

  it('sem a arte nem da reserva, nulo', () => {
    expect(sleepingArt({ lastMap: null, mode: 'retake' }, {})).toBeNull();
  });
});
