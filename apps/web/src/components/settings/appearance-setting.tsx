'use client';

import { CheckIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/hooks/use-theme';
import { parseTheme, THEMES } from '@/lib/theme';
import { cn } from '@/lib/utils';

/**
 * Tema do site: dois rádios nativos (setas trocam, Tab entra e sai) com uma miniatura de cada
 * tema. A escolha vale neste navegador (localStorage); o tema não é um dado da Conta.
 */
export function AppearanceSetting() {
  const t = useTranslations('settings.appearance');
  const { theme, setTheme } = useTheme();

  return (
    <fieldset className="grid gap-3 rounded-lg px-4 py-3 max-md:px-3" data-testid="theme-setting">
      <legend className="grid gap-0.5 px-0">
        <span className="text-body font-semibold">{t('title')}</span>
        <span className="text-body-sm font-normal text-muted-foreground">{t('description')}</span>
      </legend>
      <div className="grid grid-cols-2 gap-3 max-sm:gap-2">
        {THEMES.map((option) => {
          return (
            <label
              key={option}
              className={cn(
                'relative grid cursor-pointer gap-2 rounded-lg bg-(--fill-rest) p-2.5 transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover)',
                'kbd-ring-within has-checked:bg-(--fill-active)',
              )}
            >
              <input
                type="radio"
                name="theme"
                value={option}
                checked={theme === option}
                onChange={(event) => setTheme(parseTheme(event.target.value))}
                data-testid={`theme-${option}`}
                className="sr-only"
              />
              {/* Cada miniatura leva o próprio data-theme: os tokens resolvem sozinhos, sem cor crua. */}
              <span
                aria-hidden="true"
                data-theme={option}
                className="grid h-16 content-center gap-1.5 rounded-xl bg-background px-3"
              >
                <span className="h-1.5 w-2/5 rounded-full bg-foreground" />
                <span className="h-4 rounded-sm bg-surface-2" />
              </span>
              <span className="flex min-h-6 items-center justify-between gap-2 px-0.5 text-sm font-semibold">
                {t(option)}
                {theme === option ? <CheckIcon aria-hidden="true" className="size-4" /> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
