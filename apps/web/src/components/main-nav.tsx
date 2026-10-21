'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Highlight, HighlightItem } from '@/components/animate-ui/primitives/effects/highlight';
import { isCurrentPath } from '@/lib/nav';
import { cn } from '@/lib/utils';

export type NavItem = { href: Route; label: string };

/**
 * Navegação principal. Um único fundo desliza entre os itens: fica na página atual e segue o
 * ponteiro ou o foco de teclado (Highlight do Animate UI; sem deslize com movimento reduzido).
 */
export function MainNav({
  label,
  items,
  className,
}: {
  label: string;
  items: NavItem[];
  className?: string;
}) {
  const pathname = usePathname();
  // O item mais específico ganha: em /staff/auditoria, "Auditoria" e não "Contas" (/staff).
  const current =
    items
      .filter((item) => isCurrentPath(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <nav aria-label={label} className={cn('flex min-w-0', className)}>
      <Highlight
        controlledItems
        value={hovered ?? current}
        click={false}
        exitDelay={0}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        className="inset-0 rounded-md bg-hover"
      >
        <ul className="flex gap-0.5" onPointerLeave={() => setHovered(null)}>
          {items.map((item) => {
            const isCurrent = item.href === current;
            return (
              <HighlightItem key={item.href} as="li" value={item.href} className="flex">
                <Link
                  href={item.href}
                  aria-current={isCurrent ? 'page' : undefined}
                  onPointerEnter={() => setHovered(item.href)}
                  onFocus={() => setHovered(item.href)}
                  onBlur={() => setHovered(null)}
                  className={cn(
                    'inline-flex min-h-9 items-center rounded-md px-3 text-sm font-[550] tracking-[0.01em] whitespace-nowrap',
                    'text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:text-foreground',
                    'focus-visible:bg-(--fill-focus) focus-visible:text-foreground focus-visible:outline-none max-md:min-h-11',
                    isCurrent && 'text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              </HighlightItem>
            );
          })}
        </ul>
      </Highlight>
    </nav>
  );
}
