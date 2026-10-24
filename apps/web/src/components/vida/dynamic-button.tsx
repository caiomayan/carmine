'use client';

import { AnimatePresence, m } from 'framer-motion';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'loading' | 'done';

/**
 * Botão dinâmico (a ideia do Dynamic Button do dqnamo, reimplementada aqui): ocioso, carregando e feito.
 * A largura do botão acompanha o texto com mola, o rótulo troca com um fade em desfoque, o carregamento
 * enche o fundo da esquerda para a direita e o "feito" vira verde com o visto se desenhando. Serve para
 * Conectar, Copiar IP e Equipar. Com movimento reduzido ficam só os fades e a cor.
 */
export function DynamicButton({
  idle,
  loading,
  done,
  icon,
  copyText,
  variant = 'cta',
  loadingMs = 1400,
  doneMs = 2200,
  className,
  testId,
}: {
  idle: string;
  loading: string;
  done: string;
  icon?: ReactNode;
  /** Se informado, é copiado para a área de transferência ao começar. */
  copyText?: string;
  variant?: 'cta' | 'quiet';
  loadingMs?: number;
  doneMs?: number;
  className?: string;
  testId?: string;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const start = () => {
    if (phase !== 'idle') return;
    if (copyText) void navigator.clipboard?.writeText(copyText).catch(() => {});
    setPhase('loading');
    timers.current.push(
      setTimeout(() => {
        setPhase('done');
        timers.current.push(setTimeout(() => setPhase('idle'), doneMs));
      }, loadingMs),
    );
  };

  const label = phase === 'idle' ? idle : phase === 'loading' ? loading : done;

  return (
    <m.button
      layout
      type="button"
      onClick={start}
      data-phase={phase}
      data-testid={testId}
      aria-busy={phase === 'loading'}
      aria-live="polite"
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className={cn(variant === 'cta' ? 'v-cta' : 'v-cta-quiet', 'v-dyn', className)}
    >
      <span aria-hidden="true" className="v-dyn-fill" />
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={phase}
          initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
          transition={{ duration: 0.22 }}
          className="inline-flex items-center gap-2"
        >
          {phase === 'loading' ? (
            <span aria-hidden="true" className="v-spin" />
          ) : phase === 'done' ? (
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-[1.05em]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <m.path d="M4 10.5l4 4 8-9" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.34, delay: 0.08 }} />
            </svg>
          ) : (
            icon
          )}
          {label}
        </m.span>
      </AnimatePresence>
    </m.button>
  );
}
