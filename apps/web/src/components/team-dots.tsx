'use client';

import type { LoadoutSide } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/animate-ui/components/radix/tooltip';
import { orderedSides, sidesLabelKey } from '@/lib/team-sides';
import { cn } from '@/lib/utils';

const SIZE = { sm: 'size-2', md: 'size-2.5' } as const;
const COLOR: Record<LoadoutSide, string> = { t: 'bg-side-t', ct: 'bg-side-ct' };

/**
 * Bolinhas dos lados em que algo está equipado: laranja = TR, azul = CT, sempre TR à esquerda e
 * CT à direita. É o indicador de lado do site todo (sem texto "equipado" visível): cada bolinha
 * tem texto para leitor de tela ("Equipada no TR" / "Equipada no CT") e o grupo tem um tooltip
 * só ("Equipada no TR e no CT"), não um por bolinha: a lista do Inventário monta dezenas. Cores de
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
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="team-dots"
          data-sides={shown.join(',')}
          className={cn('inline-flex items-center gap-1.5 p-1 -m-1', className)}
        >
          {shown.map((side) => (
            <span key={side} data-side={side} className="grid place-items-center">
              <span
                aria-hidden="true"
                className={cn(
                  'rounded-full transition-[scale,opacity,background-color] duration-(--dur-base) ease-(--ease-out)',
                  // A bolinha entra crescendo quando o Item passa a estar equipado nesse lado.
                  'starting:scale-50 starting:opacity-0 motion-reduce:starting:scale-100',
                  SIZE[size],
                  COLOR[side],
                )}
              />
              <span className="sr-only">{t(side)}</span>
            </span>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {t(sidesLabelKey(shown))}
      </TooltipContent>
    </Tooltip>
  );
}
