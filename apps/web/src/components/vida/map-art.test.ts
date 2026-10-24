import { describe, expect, it } from 'vitest';
import {
  artChoice,
  artPair,
  artTable,
  artUrl,
  choicePalette,
  dayKey,
  hasMapArt,
  mapPalette,
  pickVariant,
} from './map-art';
import catalog from './map-art.json';

const MAPS = Object.keys(catalog);

describe('pickVariant: a arte do dia de cada mapa', () => {
  it('é estável no mesmo dia e no mesmo mapa', () => {
    for (const map of MAPS) {
      expect(pickVariant(map, true, '2026-10-24')).toEqual(pickVariant(map, true, '2026-10-24'));
    }
  });

  it('no escuro prefere as variantes noturnas quando existem; no claro, as diurnas', () => {
    for (const map of MAPS) {
      const all = (catalog as Record<string, { night: boolean }[]>)[map] ?? [];
      const night = pickVariant(map, true, '2026-10-24');
      const day = pickVariant(map, false, '2026-10-24');
      if (all.some((v) => v.night)) expect(night?.night).toBe(true);
      if (all.some((v) => !v.night)) expect(day?.night).toBe(false);
    }
  });

  it('varia ao longo dos dias quando há mais de uma variante', () => {
    const many = MAPS.find(
      (map) =>
        ((catalog as Record<string, { night: boolean }[]>)[map] ?? []).filter((v) => !v.night)
          .length > 1,
    );
    if (!many) return;
    const ids = new Set(
      Array.from(
        { length: 30 },
        (_, day) => pickVariant(many, false, `2026-10-${String(day + 1).padStart(2, '0')}`)?.id,
      ),
    );
    expect(ids.size).toBeGreaterThan(1);
  });

  it('mapa sem arte não tem variante nem paleta quebrada', () => {
    expect(hasMapArt('de_nao_existe')).toBe(false);
    expect(pickVariant('de_nao_existe', true)).toBeNull();
    expect(mapPalette('de_nao_existe', true)).toEqual(['#888888', '#888888', '#888888']);
  });
});

describe('artUrl e dayKey', () => {
  it('monta o caminho da imagem em public/maps', () => {
    expect(artUrl('mirage', 'd0')).toBe('/maps/mirage/d0-1600.webp');
    expect(artUrl('mirage', 'd0', 480, 'avif')).toBe('/maps/mirage/d0-480.avif');
  });

  it('a chave do dia é a data UTC', () => {
    expect(dayKey(new Date('2026-10-24T23:59:59Z'))).toBe('2026-10-24');
  });
});

describe('o que vai ao navegador', () => {
  it('artChoice não leva o blur (o JSON inteiro fica no servidor)', () => {
    const choice = artChoice('mirage', true, '2026-10-24');
    expect(choice).not.toBeNull();
    expect(Object.keys(choice ?? {}).sort()).toEqual(['average', 'colors', 'id', 'night']);
    expect(JSON.stringify(choice)).not.toContain('data:image');
  });

  it('artPair traz a escolha clara e a escura, e é nulo sem arte', () => {
    const pair = artPair('mirage', '2026-10-24');
    expect(pair?.day.id).toBe(pickVariant('mirage', false, '2026-10-24')?.id);
    expect(pair?.night.id).toBe(pickVariant('mirage', true, '2026-10-24')?.id);
    expect(artPair('de_nao_existe')).toBeNull();
  });

  it('artTable cobre todos os mapas do catálogo', () => {
    expect(Object.keys(artTable('2026-10-24')).sort()).toEqual([...MAPS].sort());
  });

  it('choicePalette devolve 3 cores, repetindo a última quando faltam', () => {
    expect(choicePalette({ colors: ['#111111'] })).toEqual(['#111111', '#111111', '#111111']);
    expect(choicePalette({ colors: ['#111', '#222'] })).toEqual(['#111', '#222', '#222']);
    expect(choicePalette(null)).toEqual(['#888888', '#888888', '#888888']);
  });
});
