import type { ReactNode } from 'react';

/** Erro de campo na Liberty: o sinal de contexto é o ponto; o texto segue neutro. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-body-sm text-foreground">
      <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger" />
      {children}
    </p>
  );
}
