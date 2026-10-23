'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { NavigationMenu } from 'radix-ui';
import { type ComponentType, useEffect, useRef, useState } from 'react';
import { Highlight, HighlightItem } from '@/components/animate-ui/primitives/effects/highlight';
import { type PanelId, panelOf } from '@/lib/header-previews/panels';
import { isCurrentPath } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { InventoryPanel } from './inventory-panel';
import { LoadoutPanel } from './loadout-panel';
import { PlayPanel } from './play-panel';
import { PreviewDataProvider } from './preview-data';
import { RankingPanel } from './ranking-panel';

export type PreviewNavItem = { href: Route; label: string };

const PANEL_VIEW: Record<PanelId, ComponentType> = {
  play: PlayPanel,
  loadout: LoadoutPanel,
  inventory: InventoryPanel,
  ranking: RankingPanel,
};

/**
 * A navegação principal com painéis de prévia (U3e), no computador. É o NavigationMenu do Radix:
 * acessível (seta para baixo abre, Esc fecha, Enter navega) e com `data-motion` para o painel
 * deslizar na direção do movimento e ajustar a altura ao ir de um item a outro. Carrega só no
 * primeiro hover ou foco do `HeaderNav` (que até lá mostra a navegação leve) e entra no lugar
 * dela com o mesmo desenho. Clicar no nome do item navega; tudo dentro do painel é clicável.
 */
export function PreviewNav({
  label,
  items,
  className,
  initial,
}: {
  label: string;
  items: PreviewNavItem[];
  className?: string;
  /** O que a pessoa já estava fazendo quando esta navegação entrou no lugar da leve. */
  initial: { href: string | null; focus: boolean };
}) {
  const t = useTranslations('headerPreviews');
  const pathname = usePathname();
  const router = useRouter();
  const root = useRef<HTMLElement>(null);
  const [value, setValue] = useState<string>(panelOf(initial.href) ?? '');
  const [hovered, setHovered] = useState<string | null>(null);

  // O item mais específico ganha, como na navegação leve.
  const current =
    items
      .filter((item) => isCurrentPath(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
  const openHref = items.find((item) => panelOf(item.href) === value)?.href ?? null;

  // Se a pessoa estava com o foco num item quando a troca aconteceu, ele volta para o mesmo item.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só na entrada
  useEffect(() => {
    if (!initial.focus || !initial.href) return;
    root.current
      ?.querySelector<HTMLElement>(`a[href="${initial.href}"]`)
      ?.focus({ preventScroll: true });
  }, []);

  // Navegou: o painel fecha. Só quando a rota MUDA: na montagem o painel pode já ter sido aberto
  // pelo hover que trouxe esta navegação para o lugar da leve.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    setValue('');
  }, [pathname]);

  return (
    <PreviewDataProvider open={value !== ''}>
      <NavigationMenu.Root
        ref={root}
        aria-label={label}
        value={value}
        onValueChange={setValue}
        delayDuration={90}
        skipDelayDuration={600}
        className={cn('flex min-w-0', className)}
        data-testid="header-nav"
      >
        <Highlight
          controlledItems
          value={hovered ?? openHref ?? current}
          click={false}
          exitDelay={0}
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          className="inset-0 rounded-md bg-hover"
        >
          <NavigationMenu.List className="flex gap-0.5" onPointerLeave={() => setHovered(null)}>
            {items.map((item) => {
              const panel = panelOf(item.href);
              const isCurrent = item.href === current;
              const View = panel ? PANEL_VIEW[panel] : null;
              return (
                <NavigationMenu.Item key={item.href} value={panel ?? item.href} className="flex">
                  <HighlightItem as="div" value={item.href} className="flex">
                    <NavigationMenu.Trigger
                      asChild
                      // Clicar no nome navega (o Trigger do Radix só abre e fecha): a nossa tratativa vem
                      // antes e, ao cancelar o evento, a dele não roda.
                      onClick={(event) => {
                        if (
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        ) {
                          return;
                        }
                        event.preventDefault();
                        setValue('');
                        router.push(item.href);
                      }}
                      // Seta para baixo abre o painel (com ele aberto, a seta leva o foco para dentro: o
                      // Radix cuida); Enter, que é um clique no link, navega; Esc fecha.
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' && panel && value !== panel) {
                          event.preventDefault();
                          setValue(panel);
                        }
                      }}
                    >
                      <Link
                        href={item.href}
                        aria-current={isCurrent ? 'page' : undefined}
                        data-testid={`nav-${panel ?? 'item'}`}
                        onPointerEnter={() => setHovered(item.href)}
                        onFocus={() => setHovered(item.href)}
                        onBlur={() => setHovered(null)}
                        className={cn(
                          'inline-flex min-h-9 items-center rounded-md px-3 text-sm font-[550] tracking-[0.01em] whitespace-nowrap',
                          'text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:text-foreground',
                          'focus-visible:text-foreground data-[state=open]:text-foreground',
                          isCurrent && 'text-foreground',
                        )}
                      >
                        {item.label}
                      </Link>
                    </NavigationMenu.Trigger>
                  </HighlightItem>
                  {View && panel ? (
                    <NavigationMenu.Content
                      className="nav-content absolute top-0 left-0 w-[34rem] max-w-[calc(100vw-2rem)] p-3"
                      data-testid={`panel-${panel}`}
                      role="group"
                      aria-label={t(`panels.${panel}`)}
                    >
                      <View />
                    </NavigationMenu.Content>
                  ) : null}
                </NavigationMenu.Item>
              );
            })}
          </NavigationMenu.List>
        </Highlight>

        {/* O painel mora sob o cabeçalho, no centro dele (a navegação também é centrada). */}
        <div className="pointer-events-none absolute top-full left-1/2 z-50 -translate-x-1/2 pt-2">
          <NavigationMenu.Viewport
            className="nav-viewport pointer-events-auto relative overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-(--shadow-overlay)"
            data-testid="header-viewport"
          />
        </div>
      </NavigationMenu.Root>
    </PreviewDataProvider>
  );
}
