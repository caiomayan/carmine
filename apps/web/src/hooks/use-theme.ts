'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { parseTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

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

/** Troca o tema com um crossfade (View Transitions), ou direto com movimento reduzido. */
export function swapTheme(theme: Theme) {
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

/**
 * O tema atual (lido do `<html>`, que o script do `<head>` já acertou) e como trocá-lo. `null`
 * no servidor e na hidratação: quem mostra o tema espera o cliente.
 */
export function useTheme(): { theme: Theme | null; setTheme: (theme: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, readTheme, readServerTheme);
  const setTheme = useCallback((next: Theme) => swapTheme(next), []);
  return { theme, setTheme };
}
