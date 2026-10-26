import { describe, expect, it } from 'vitest';
import { isCustomAvatarUrl, naturalCrop, outputSide, pickProblem } from './avatar';

describe('isCustomAvatarUrl', () => {
  it('reconhece a foto própria em qualquer tamanho e rejeita a da Steam', () => {
    const id = '0d8f4b2e-6c1a-4e3f-9a57-1b2c3d4e5f60';
    expect(isCustomAvatarUrl(`https://img.stcarmine.com/avatars/${id}/512.webp`)).toBe(true);
    expect(isCustomAvatarUrl(`https://img.example/avatars/${id}/64.webp`)).toBe(true);
    expect(isCustomAvatarUrl('https://avatars.steamstatic.com/abc_full.jpg')).toBe(false);
    expect(isCustomAvatarUrl(`https://img.stcarmine.com/avatars/${id}/512.png`)).toBe(false);
    expect(isCustomAvatarUrl(null)).toBe(false);
  });
});

describe('pickProblem', () => {
  it('aceita JPEG, PNG e WebP dentro dos limites', () => {
    expect(
      pickProblem({ type: 'image/png', size: 1000 }, { width: 4000, height: 3000 }),
    ).toBeNull();
    expect(pickProblem({ type: 'image/webp', size: 10 * 1024 * 1024 })).toBeNull();
  });

  it('recusa o formato, o peso e a área', () => {
    expect(pickProblem({ type: 'image/gif', size: 10 })).toBe('type');
    expect(pickProblem({ type: 'image/heic', size: 10 })).toBe('type');
    expect(pickProblem({ type: 'image/png', size: 10 * 1024 * 1024 + 1 })).toBe('bytes');
    expect(pickProblem({ type: 'image/png', size: 10 }, { width: 8000, height: 6000 })).toBe(
      'pixels',
    );
  });
});

describe('naturalCrop', () => {
  const natural = { width: 2000, height: 1000 };
  const shown = { width: 400, height: 200 };

  it('sem zoom, escala a tela para a imagem original', () => {
    expect(naturalCrop({ x: 100, y: 0, width: 200 }, shown, natural, 1)).toEqual({
      x: 500,
      y: 0,
      side: 1000,
    });
  });

  it('com zoom, o mesmo recorte na tela cobre menos da imagem, ao redor do centro', () => {
    // O ponto x = 100 da tela, com zoom 2 ao redor do centro (x = 200), mostra o ponto 150 da imagem: 750 na original.
    const crop = naturalCrop({ x: 100, y: 0, width: 100 }, shown, natural, 2);
    expect(crop).toEqual({ x: 750, y: 250, side: 250 });
  });
});

describe('outputSide', () => {
  it('até 512 px, sem inventar pixels que o recorte não tem', () => {
    expect(outputSide(2000, 256)).toBe(512);
    expect(outputSide(300.7, 256)).toBe(300);
    expect(outputSide(512, 256)).toBe(512);
  });

  it('abaixo do mínimo, não dá', () => {
    expect(outputSide(255.9, 256)).toBeNull();
  });
});
