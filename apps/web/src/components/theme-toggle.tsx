'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/animate-ui/components/radix/tooltip';
import { MoonIcon } from '@/components/icons/animated/moon';
import { SunIcon } from '@/components/icons/animated/sun';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { useSession } from '@/components/session/session-provider';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/use-theme';
import { DEFAULT_THEME, oppositeTheme } from '@/lib/theme';

/**
 * Alterna escuro e claro. O ícone mostra o destino da troca: sol no escuro, lua no claro. Só para
 * visitantes: com a Conta aberta, o tema vive no menu da Conta e em Configurações.
 */
export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const { status } = useSession();
  const { theme, setTheme } = useTheme();
  if (status === 'authenticated') return null;
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
