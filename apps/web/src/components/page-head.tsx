import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Título da página, linha de apoio e, à direita, os controles da página (filtros, ações). */
export function PageHead({
  title,
  subtitle,
  aside,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-4 gap-y-4 pt-10 pb-5 max-md:pt-7',
        className,
      )}
    >
      <div className="grid min-w-0 gap-1.5">
        <h1 className="text-display max-md:text-[26px]">{title}</h1>
        {subtitle ? (
          <p className="max-w-[60ch] text-body-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {aside}
    </div>
  );
}
