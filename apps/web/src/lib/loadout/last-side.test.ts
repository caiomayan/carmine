import { describe, expect, it } from 'vitest';
import { LAST_SIDE_KEY, readLastSide, writeLastSide } from './last-side';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

const broken = (): Storage => {
  const fail = () => {
    throw new Error('SecurityError');
  };
  return { ...memoryStorage(), getItem: fail, setItem: fail };
};

describe('último lado do Loadout', () => {
  it('abre no CT quando não há nada guardado', () => {
    expect(readLastSide(memoryStorage())).toBe('ct');
  });

  it('abre no lado guardado', () => {
    expect(readLastSide(memoryStorage({ [LAST_SIDE_KEY]: 't' }))).toBe('t');
    expect(readLastSide(memoryStorage({ [LAST_SIDE_KEY]: 'ct' }))).toBe('ct');
  });

  it('ignora um valor que não é um lado', () => {
    expect(readLastSide(memoryStorage({ [LAST_SIDE_KEY]: 'both' }))).toBe('ct');
    expect(readLastSide(memoryStorage({ [LAST_SIDE_KEY]: '' }))).toBe('ct');
  });

  it('grava o lado e lê de volta', () => {
    const storage = memoryStorage();
    writeLastSide(storage, 't');
    expect(readLastSide(storage)).toBe('t');
  });

  it('sem armazenamento (bloqueado, janela privada), lê CT e gravar não quebra', () => {
    expect(readLastSide(null)).toBe('ct');
    expect(readLastSide(broken())).toBe('ct');
    expect(() => writeLastSide(null, 't')).not.toThrow();
    expect(() => writeLastSide(broken(), 't')).not.toThrow();
  });
});
