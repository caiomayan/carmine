import type { ReactNode } from 'react';
import { AnimatedIcon, type AnimatedIconComponent } from '@/components/icons/animated-icon';
import { cn } from '@/lib/utils';

/**
 * Estado vazio da Liberty: sem moldura nem linhas; um ícone num disco de superfície, o fato
 * em texto pleno e a explicação em secundário. O ícone anima com o hover do bloco.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: AnimatedIconComponent;
  title: ReactNode;
  body: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-icon-trigger
      className={cn(
        'mx-auto grid max-w-[460px] justify-items-center gap-2 px-4 py-11 text-center',
        className,
      )}
    >
      <span className="mb-2 grid size-11 place-items-center rounded-full bg-surface-2 text-foreground">
        <AnimatedIcon icon={icon} size={20} />
      </span>
      <p className="text-md font-semibold">{title}</p>
      <p className="max-w-[42ch] text-[13.5px] text-muted-foreground">{body}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
