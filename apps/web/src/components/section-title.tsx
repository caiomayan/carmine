import type { ReactNode } from 'react';

/** Título de seção da Liberty: Inter em versalete com tracking largo e um losango no texto. */
export function SectionTitle({
  id,
  children,
  aside,
}: {
  id?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pb-3">
      <h2
        id={id}
        className="inline-flex items-center gap-2.5 label-caps text-[11px] text-foreground"
      >
        <span aria-hidden="true" className="size-1.5 rotate-45 bg-foreground" />
        {children}
      </h2>
      {aside}
    </div>
  );
}
