import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addRecent,
  clearRecent,
  loadRecent,
  parseRecent,
  RECENT_MAX,
  recentKey,
  saveRecent,
} from './history';

describe('addRecent', () => {
  it('põe a busca nova na frente', () => {
    expect(addRecent(['ak', 'awp'], 'karambit')).toEqual(['karambit', 'ak', 'awp']);
  });

  it('não repete: a busca que já estava sobe, sem ligar para maiúsculas, acento nem espaços', () => {
    expect(addRecent(['ak', 'Aurélio', 'awp'], '  aurelio ')).toEqual(['aurelio', 'ak', 'awp']);
  });

  it('guarda só as últimas', () => {
    const full = Array.from({ length: RECENT_MAX }, (_, i) => `busca ${i}`);

    const next = addRecent(full, 'nova');

    expect(next).toHaveLength(RECENT_MAX);
    expect(next[0]).toBe('nova');
    expect(next).not.toContain(`busca ${RECENT_MAX - 1}`);
  });

  it('ignora busca curta demais ou vazia', () => {
    expect(addRecent(['ak'], ' ')).toEqual(['ak']);
    expect(addRecent(['ak'], 'a')).toEqual(['ak']);
  });

  it('apara e comprime os espaços', () => {
    expect(addRecent([], '  ak    47 ')).toEqual(['ak 47']);
  });
});

describe('parseRecent', () => {
  it('lê uma lista de textos', () => {
    expect(parseRecent('["ak","awp"]')).toEqual(['ak', 'awp']);
  });

  it.each([
    ['nulo', null],
    ['vazio', ''],
    ['JSON quebrado', '{oi'],
    ['não é lista', '{"a":1}'],
  ])('devolve lista vazia para %s', (_title, raw) => {
    expect(parseRecent(raw)).toEqual([]);
  });

  it('descarta o que não é texto utilizável e corta no limite', () => {
    const raw = JSON.stringify([
      1,
      null,
      '',
      ' ',
      'ok',
      ...Array.from({ length: 20 }, (_, i) => `b${i}`),
    ]);

    const list = parseRecent(raw);

    expect(list[0]).toBe('ok');
    expect(list).toHaveLength(RECENT_MAX);
  });
});

describe('recentKey', () => {
  it('é uma chave por pessoa; o visitante tem a sua', () => {
    expect(recentKey(10_016)).toBe('carmine-search-recent:10016');
    expect(recentKey(null)).toBe('carmine-search-recent:visitante');
    expect(recentKey(10_016)).not.toBe(recentKey(10_017));
  });
});

describe('armazenamento', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubStorage(store: Record<string, string>) {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
    });
  }

  it('guarda e lê por pessoa', () => {
    stubStorage({});

    saveRecent(10_016, ['ak']);

    expect(loadRecent(10_016)).toEqual(['ak']);
    expect(loadRecent(10_017)).toEqual([]);
    expect(loadRecent(null)).toEqual([]);
  });

  it('limpa só o histórico da pessoa', () => {
    stubStorage({});
    saveRecent(1, ['a1']);
    saveRecent(2, ['b2']);

    clearRecent(1);

    expect(loadRecent(1)).toEqual([]);
    expect(loadRecent(2)).toEqual(['b2']);
  });

  it('com o armazenamento bloqueado, não quebra e a lista vem vazia', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    });

    expect(loadRecent(1)).toEqual([]);
    expect(() => saveRecent(1, ['ak'])).not.toThrow();
    expect(() => clearRecent(1)).not.toThrow();
  });

  it('sem localStorage nenhum, também não quebra', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(loadRecent(1)).toEqual([]);
    expect(() => saveRecent(1, ['ak'])).not.toThrow();
  });
});
