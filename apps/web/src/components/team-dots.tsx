'use client';

import type { LoadoutSide } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/animate-ui/components/radix/tooltip';
import { orderedSides } from '@/lib/team-sides';
import { cn } from '@/lib/utils';

const SIZE = { sm: 'size-2', md: 'size-2.5' } as const;
const COLOR: Record<LoadoutSide, string> = { t: 'bg-side-t', ct: 'bg-side-ct' };

/**
 * Bolinhas dos lados em que algo está equipado: laranja = TR, azul = CT, sempre TR à esquerda e
 * CT à direita. É o indicador de lado do site todo (sem texto "equipado" visível): cada bolinha
 * tem tooltip e texto para leitor de tela ("Equipada no TR" / "Equipada no CT"). Cores de
 * contexto (`--side-ct`, `--side-t`), não de marca. Sem lados, não renderiza nada.
 */
export function TeamDots({
  sides,
  size = 'md',
  className,
}: {
  sides: readonly LoadoutSide[];
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const t = useTranslations('common.team.equippedIn');
  const shown = orderedSides(sides);
  if (shown.length === 0) return null;
  return (
    <span
      data-testid="team-dots"
      data-sides={shown.join(',')}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      {shown.map((side) => (
        <Tooltip key={side}>
          <TooltipTrigger asChild>
            <span data-side={side} className="grid place-items-center p-1 -m-1">
              <span
                aria-hidden="true"
                className={cn(
                  'rounded-full transition-[transform,opacity,background-color] duration-(--dur-base) ease-(--ease-out)',
                  // A bolinha entra crescendo quando o Item passa a estar equipado nesse lado.
                  'starting:scale-50 starting:opacity-0 motion-reduce:starting:scale-100',
                  SIZE[size],
                  COLOR[side],
                )}
              />
              <span className="sr-only">{t(side)}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {t(side)}
          </TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}
