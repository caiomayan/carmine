import { describe, expect, it } from 'vitest';
import {
  CARTA_FORMAT_SPEC,
  CARTA_FORMATS,
  cartaImagePath,
  examplePlayer,
  isCartaFormat,
  parseCarta,
} from './data';

describe('parseCarta', () => {
  it('lê formato, modo e privacidade da URL; o que não vale cai no padrão', () => {
    expect(parseCarta(new URLSearchParams('formato=story&modo=deathmatch&privado=1'))).toEqual({
      format: 'story',
      mode: 'deathmatch',
      privateProfile: true,
    });
    expect(parseCarta(new URLSearchParams('formato=xyz&modo=5v5&privado=0'))).toEqual({
      format: 'cartao',
      mode: 'retake',
      privateProfile: false,
    });
    expect(parseCarta({ formato: ['og', 'story'], modo: undefined })).toMatchObject({
      format: 'og',
    });
  });

  it('a imagem de volta na URL: ida e volta', () => {
    for (const format of CARTA_FORMATS) {
      const options = { format, mode: 'deathmatch', privateProfile: true } as const;
      const path = cartaImagePath(options);
      expect(parseCarta(new URL(path, 'http://x').searchParams)).toEqual(options);
    }
    expect(cartaImagePath({ format: 'og', mode: 'retake', privateProfile: false })).toBe(
      '/dev/carta/imagem?formato=og&modo=retake',
    );
  });
});

describe('formatos', () => {
  it('três formatos, com as proporções de cada rede', () => {
    expect(CARTA_FORMATS).toEqual(['cartao', 'story', 'og']);
    const { cartao, story, og } = CARTA_FORMAT_SPEC;
    expect(cartao.width / cartao.height).toBeCloseTo(4 / 5);
    expect(story.width / story.height).toBeCloseTo(9 / 16);
    expect(og.width / og.height).toBeCloseTo(1.905, 2);
    expect(isCartaFormat('story')).toBe(true);
    expect(isCartaFormat('quadrado')).toBe(false);
  });
});

describe('examplePlayer', () => {
  it('o Perfil privado não leva Estatísticas, só nome e Loadout', () => {
    expect(examplePlayer({ privateProfile: true, mode: 'retake' }).stats).toBeNull();
    expect(examplePlayer({ privateProfile: false, mode: 'retake' }).stats?.primary.label).toBe(
      'Rounds vencidos',
    );
    expect(examplePlayer({ privateProfile: false, mode: 'deathmatch' }).stats?.primary.label).toBe(
      'Abates por minuto',
    );
  });

  it('o ID público nunca está no cartão', () => {
    expect(JSON.stringify(examplePlayer({ privateProfile: false, mode: 'retake' }))).not.toMatch(
      /publicId|#\d/,
    );
  });
});
