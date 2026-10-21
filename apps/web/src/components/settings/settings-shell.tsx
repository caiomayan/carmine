'use client';

import { ChevronRightIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeftIcon } from '@/components/icons/animated/arrow-left';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  activeSettingsSection,
  SETTINGS_BASE,
  SETTINGS_SECTIONS,
  settingsHref,
} from '@/lib/settings-nav';
import { cn } from '@/lib/utils';

export type SettingsShellLabels = {
  nav: string;
  back: string;
  sections: Record<(typeof SETTINGS_SECTIONS)[number], string>;
};

/**
 * A moldura de Configurações: navegação lateral no desktop (a raiz abre Perfil) e, no celular,
 * o padrão de lista que leva às seções (a raiz é a lista; cada seção traz um "voltar"). O H1 da
 * página fica no DOM em todas as rotas, só some da vista no celular dentro de uma seção.
 */
export function SettingsShell({
  labels,
  head,
  children,
}: {
  labels: SettingsShellLabels;
  head: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = activeSettingsSection(pathname);
  // Na raiz, o desktop mostra o Perfil (e o marca como atual); o celular mostra a lista, onde nenhuma
  // seção é a atual.
  const desktop = useMediaQuery('(min-width: 768px)');
  const current = active ?? (desktop ? 'perfil' : null);

  return (
    <div className="container-page pb-16">
      <div className={cn(active && 'max-md:sr-only')}>{head}</div>
      {active ? (
        <Link
          href={SETTINGS_BASE as Route}
          className="-ml-2 inline-flex min-h-(--tap) items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground md:hidden"
          data-testid="settings-back"
        >
          <AnimatedIcon icon={ArrowLeftIcon} size={16} />
          {labels.back}
        </Link>
      ) : null}
      <div className="grid gap-x-12 gap-y-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label={labels.nav} className={cn(active && 'max-md:hidden')}>
          <ul className="grid gap-1 max-md:gap-2">
            {SETTINGS_SECTIONS.map((section) => (
              <li key={section}>
                <Link
                  href={settingsHref(section) as Route}
                  aria-current={current === section ? 'page' : undefined}
                  data-testid={`settings-nav-${section}`}
                  className={cn(
                    'flex min-h-(--tap) items-center justify-between gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-foreground md:aria-[current=page]:bg-hover',
                    'max-md:min-h-14 max-md:bg-surface max-md:px-4 max-md:text-foreground max-md:text-[15px]',
                  )}
                >
                  {labels.sections[section]}
                  <ChevronRightIcon aria-hidden="true" className="size-4 md:hidden" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 max-w-[40rem]">{children}</div>
      </div>
    </div>
  );
}
