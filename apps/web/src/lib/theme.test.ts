import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME,
  oppositeTheme,
  parseTheme,
  THEME_STORAGE_KEY,
  themeInitScript,
} from './theme';

type FakeRoot = { dataset: Record<string, string> };

function runInitScript(storage: { getItem(key: string): string | null }) {
  const root: FakeRoot = { dataset: {} };
  new Function('document', 'localStorage', themeInitScript)({ documentElement: root }, storage);
  return root.dataset.theme;
}

describe('parseTheme', () => {
  it('aceita os temas conhecidos', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
  });

  it('cai no escuro para qualquer outro valor', () => {
    for (const value of [null, undefined, '', 'sepia', 'DARK', 42]) {
      expect(parseTheme(value)).toBe(DEFAULT_THEME);
    }
    expect(DEFAULT_THEME).toBe('dark');
  });
});

describe('oppositeTheme', () => {
  it('alterna entre escuro e claro', () => {
    expect(oppositeTheme('dark')).toBe('light');
    expect(oppositeTheme('light')).toBe('dark');
  });
});

describe('themeInitScript', () => {
  it('aplica o tema salvo antes da pintura', () => {
    const theme = runInitScript({ getItem: (key) => (key === THEME_STORAGE_KEY ? 'light' : null) });
    expect(theme).toBe('light');
  });

  it('usa o escuro sem preferência salva ou com valor inválido', () => {
    expect(runInitScript({ getItem: () => null })).toBe('dark');
    expect(runInitScript({ getItem: () => 'neon' })).toBe('dark');
  });

  it('não quebra quando o armazenamento está bloqueado', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(runInitScript(blocked)).toBe('dark');
  });
});
