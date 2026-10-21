'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/animate-ui/components/radix/tooltip';
import { MoonIcon } from '@/components/icons/animated/moon';
import { SunIcon } from '@/components/icons/animated/sun';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_THEME, oppositeTheme } from '@/lib/theme';

/**
 * Alterna escuro e claro, com ou sem Conta. O ícone mostra o destino da troca: sol no escuro, lua
 * no claro. Em Configurações > Aparência a escolha também está, com a prévia de cada tema.
 */
export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const { theme, setTheme } = useTheme();
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
          onClick={() => setTheme(oppositeTheme(theme ?? DEFAULT_THEME))}
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
