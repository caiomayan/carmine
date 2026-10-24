import { cn } from '@/lib/utils';

/**
 * Estado vazio com cena em vez de caixa de texto: silhuetas de jogadores, com um anel tracejado girando em volta
 * de quem falta (parado com movimento reduzido). Decorativa: o texto do estado vem ao lado.
 */
export function EmptyScene({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn('relative mx-auto h-[92px] w-[190px]', className)}>
      <svg viewBox="0 0 190 92" className="absolute inset-0 size-full text-foreground">
        <title>Silhuetas de jogadores</title>
        <g fill="currentColor">
          <circle cx="95" cy="30" r="15" opacity="0.22" />
          <path d="M62 86c0-19 15-32 33-32s33 13 33 32z" opacity="0.22" />
          <circle cx="42" cy="40" r="11" opacity="0.12" />
          <path d="M18 86c0-14 11-24 24-24s24 10 24 24z" opacity="0.12" />
          <circle cx="148" cy="40" r="11" opacity="0.12" />
          <path d="M124 86c0-14 11-24 24-24s24 10 24 24z" opacity="0.12" />
        </g>
        <circle
          cx="95"
          cy="30"
          r="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 5"
          opacity="0.5"
          className="origin-[95px_30px] motion-safe:animate-[spin_18s_linear_infinite]"
        />
      </svg>
    </div>
  );
}
