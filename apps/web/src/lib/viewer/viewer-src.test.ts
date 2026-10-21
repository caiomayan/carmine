import { describe, expect, it } from 'vitest';
import { buildViewerSrc, stringifyViewerItem } from './viewer-src';

describe('endereço do viewer 3D', () => {
  it('leva o Item inteiro no ?item=, com as chaves em ordem estável', () => {
    const item = { seed: 661, id: 222, wear: 0.15, statTrak: 0 };
    const src = new URL(buildViewerSrc(item));
    expect(src.origin).toBe('https://3d.cstrike.app');
    expect(src.pathname).toBe('/view');
    expect(src.searchParams.get('item')).toBe('{"id":222,"seed":661,"statTrak":0,"wear":0.15}');
    expect(stringifyViewerItem({ id: 222, wear: 0.15, statTrak: 0, seed: 661 })).toBe(
      src.searchParams.get('item'),
    );
  });

  it('não manda o halfRotation: a build do viewer não lê esse parâmetro', () => {
    expect(new URL(buildViewerSrc({ id: 1 })).searchParams.has('halfRotation')).toBe(false);
  });

  it('manda a partner key só quando existe', () => {
    expect(new URL(buildViewerSrc({ id: 1 })).searchParams.has('key')).toBe(false);
    expect(new URL(buildViewerSrc({ id: 1 }, { key: 'k' })).searchParams.get('key')).toBe('k');
  });
});
