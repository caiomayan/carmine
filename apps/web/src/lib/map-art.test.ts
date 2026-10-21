import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_ART_WIDTHS, mapArt, mapDisplayName, ROTATION_MAPS } from './map-art';

describe('mapArt', () => {
  it('acha a arte de cada mapa da rotação pelo nome do jogo', () => {
    for (const slug of ROTATION_MAPS) {
      expect(mapArt(`de_${slug}`)?.slug).toBe(slug);
    }
  });

  it('ignora caixa, espaços e o caminho de mapa da Workshop', () => {
    expect(mapArt(' DE_Mirage ')?.slug).toBe('mirage');
    expect(mapArt('workshop/3070284539/de_dust2')?.slug).toBe('dust2');
  });

  it('devolve nulo para mapa sem imagem, vazio ou ausente (fundo neutro)', () => {
    expect(mapArt('de_vertigo')).toBeNull();
    expect(mapArt('cs_office')).toBeNull();
    expect(mapArt('')).toBeNull();
    expect(mapArt(null)).toBeNull();
  });

  it('monta os srcset de AVIF e WebP com as duas larguras', () => {
    const art = mapArt('de_nuke');
    expect(art?.avif).toBe('/maps/nuke-800.avif 800w, /maps/nuke-1600.avif 1600w');
    expect(art?.webp).toBe('/maps/nuke-800.webp 800w, /maps/nuke-1600.webp 1600w');
    expect(art?.src).toBe('/maps/nuke-1600.webp');
    expect(MAP_ART_WIDTHS).toEqual([800, 1600]);
    expect(art).toMatchObject({ width: 1600, height: 900 });
  });
});

describe('mapDisplayName', () => {
  it('tira o prefixo do modo e põe a primeira letra em maiúscula', () => {
    expect(mapDisplayName('de_mirage')).toBe('Mirage');
    expect(mapDisplayName('de_dust2')).toBe('Dust2');
    expect(mapDisplayName('cs_office')).toBe('Office');
    expect(mapDisplayName('workshop/1/de_train')).toBe('Train');
  });

  it('não inventa nome: nulo vira nulo', () => {
    expect(mapDisplayName(null)).toBeNull();
    expect(mapDisplayName('')).toBeNull();
  });
});

describe('arquivos em public/maps', () => {
  it('cada mapa da rotação tem as duas larguras em AVIF e WebP (rode scripts/maps.mjs)', () => {
    const dir = path.join(process.cwd(), 'public/maps');
    const missing = ROTATION_MAPS.flatMap((slug) =>
      MAP_ART_WIDTHS.flatMap((w) => ['avif', 'webp'].map((format) => `${slug}-${w}.${format}`)),
    ).filter((file) => !existsSync(path.join(dir, file)));
    expect(missing).toEqual([]);
  });
});
