'use client';

import { useSyncExternalStore } from 'react';
import { oppositeTheme, parseTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';
import styles from './theme-toggle.module.css';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

const readTheme = (): Theme => parseTheme(document.documentElement.dataset.theme);
// No servidor o tema salvo é desconhecido; o script do <head> já o aplicou antes da hidratação.
const readServerTheme = (): Theme | null => null;

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // armazenamento bloqueado: o tema vale só nesta visita
  }
}

function swapTheme(theme: Theme) {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced && typeof document.startViewTransition === 'function') {
    document.startViewTransition(() => applyTheme(theme));
    return;
  }
  // Sem crossfade: troca tudo no mesmo quadro, sem transições de cor pela metade.
  root.classList.add('no-tx');
  applyTheme(theme);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('no-tx')));
}

export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const theme = useSyncExternalStore(subscribe, readTheme, readServerTheme);
  const label = theme === 'light' ? labels.dark : labels.light;

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      onClick={() => swapTheme(oppositeTheme(readTheme()))}
    >
      <svg className={`${styles.icon} ${styles.sun}`} viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="3.6" />
        <path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
      </svg>
      <svg className={`${styles.icon} ${styles.moon}`} viewBox="0 0 20 20" aria-hidden="true">
        <path d="M16.4 12.6A6.8 6.8 0 0 1 7.4 3.6a6.8 6.8 0 1 0 9 9Z" />
      </svg>
    </button>
  );
}
