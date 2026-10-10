import { cn } from '@/lib/utils';

export type StatusTone = 'online' | 'warn' | 'danger' | 'offline';

const TONE: Record<StatusTone, string> = {
  online: 'bg-status-online',
  warn: 'bg-status-warn',
  danger: 'bg-status-danger',
  offline: 'bg-status-offline',
};

/**
 * Ponto de estado: um dos poucos lugares onde entra cor de contexto. Decorativo; o estado
 * sempre vem escrito ao lado. `pulse` marca o "ao vivo" (parado com movimento reduzido).
 */
export function StatusDot({
  tone,
  pulse = false,
  className,
}: {
  tone: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('relative size-[7px] shrink-0 rounded-full', TONE[tone], className)}
    >
      {pulse ? (
        <span className={cn('absolute inset-0 rounded-full animate-pulse-dot', TONE[tone])} />
      ) : null}
    </span>
  );
}
