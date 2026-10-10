'use client';

import { useSyncExternalStore } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/animate-ui/components/radix/tooltip';
import { MoonIcon } from '@/components/icons/animated/moon';
import { SunIcon } from '@/components/icons/animated/sun';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { oppositeTheme, parseTheme, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

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

/** Alterna escuro e claro. O ícone mostra o destino da troca: sol no escuro, lua no claro. */
export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const theme = useSyncExternalStore(subscribe, readTheme, readServerTheme);
  const label = theme === 'light' ? labels.dark : labels.light;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="quiet"
          size="icon"
          aria-label={label}
          data-testid="theme-toggle"
          onClick={() => swapTheme(oppositeTheme(readTheme()))}
        >
          <AnimatedIcon icon={SunIcon} size={18} className="light:hidden" />
          <AnimatedIcon icon={MoonIcon} size={18} className="dark:hidden" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
