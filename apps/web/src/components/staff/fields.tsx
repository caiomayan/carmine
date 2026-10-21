import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Controles de formulário do painel da Staff, no mesmo vocabulário do editor de Item: campos
 * sem borda, fundo de superfície que clareia no hover e no foco. Campos de texto nativos; as
 * listas usam o `SimpleSelect` (`@/components/ui/select`).
 */
export const controlClass =
  'min-h-(--tap) w-full rounded-md bg-surface px-3 text-sm transition-colors duration-(--dur-fast) ease-std placeholder:text-muted-foreground hover:bg-surface-2 focus-visible:bg-surface-2 disabled:text-faint disabled:hover:bg-surface aria-invalid:outline-1 aria-invalid:outline-status-danger';

export function Field({
  id,
  label,
  hint,
  error,
  aside,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] font-semibold">
          {label}
        </label>
        {aside ? (
          <span className="text-[12px] text-muted-foreground tabular-nums">{aside}</span>
        ) : null}
      </div>
      {children}
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Erro na Liberty: o sinal de contexto é o ponto; o texto segue neutro. */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-[12.5px] text-foreground">
      <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger" />
      {children}
    </p>
  );
}

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(controlClass, 'min-h-20 resize-y py-2 leading-[1.5]', className)}
      {...props}
    />
  );
}
