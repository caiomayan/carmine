export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

/** Escuro quente é o padrão do produto; a preferência do sistema não muda isso. */
export const DEFAULT_THEME: Theme = 'dark';
export const THEME_STORAGE_KEY = 'carmine-theme';

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : DEFAULT_THEME;
}

export function oppositeTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}

/**
 * Roda inline no <head>, antes da primeira pintura, para o tema salvo não piscar.
 * Não pode depender de nada do bundle: é uma string autocontida.
 */
export const themeInitScript = `(function(){var t=${JSON.stringify(DEFAULT_THEME)};try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEMES)}.indexOf(s)>-1)t=s}catch(e){}document.documentElement.dataset.theme=t})();`;
