'use client';

import { AnimatePresence, m } from 'framer-motion';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Phase = 'idle' | 'loading' | 'done';

/**
 * Botão dinâmico (a ideia do Dynamic Button do dqnamo, reimplementada): ocioso, carregando e feito. A largura
 * acompanha o texto com mola, o rótulo troca com um fade em desfoque, o carregamento enche o fundo da esquerda
 * para a direita e o "feito" vira verde com o visto se desenhando. Com movimento reduzido ficam só os fades e a
 * cor (o `MotionConfig` do site desliga a mola e o layout).
 *
 * Serve a ações de verdade: `href` o torna um link (o `steam://connect`) e `onAction` faz o trabalho (copiar o
 * IP). Se `onAction` devolve `false` (a cópia falhou), volta a ocioso sem fingir que deu certo. Sem `done`, depois
 * do carregamento volta direto ao ocioso (abrir o jogo não tem como confirmar que conectou).
 */
export function DynamicButton({
  idle,
  loading,
  done,
  href,
  onAction,
  ariaLabel,
  describedBy,
  variant = 'cta',
  loadingMs = 1200,
  doneMs = 2000,
  className,
  testId,
  children,
}: {
  idle: string;
  loading: string;
  done?: string;
  /** Com `href` é um link; sem, um botão. */
  href?: string;
  /** Chamado ao começar; `false` (ou uma promessa de `false`) cancela o "feito". */
  onAction?: () => boolean | undefined | Promise<boolean | undefined>;
  ariaLabel?: string;
  describedBy?: string;
  variant?: 'cta' | 'quiet';
  loadingMs?: number;
  doneMs?: number;
  className?: string;
  testId?: string;
  /** Um ícone antes do rótulo ocioso. */
  children?: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );

  const start = async () => {
    if (phase !== 'idle') return;
    setPhase('loading');
    const started = Date.now();
    const ok = (await onAction?.()) !== false;
    const wait = Math.max(0, loadingMs - (Date.now() - started));
    timers.current.push(
      setTimeout(() => {
        if (!ok || !done) {
          setPhase('idle');
          return;
        }
        setPhase('done');
        timers.current.push(setTimeout(() => setPhase('idle'), doneMs));
      }, wait),
    );
  };

  const label = phase === 'idle' ? idle : phase === 'loading' ? loading : (done ?? idle);
  const Component = href ? m.a : m.button;

  return (
    <Component
      layout
      {...(href ? { href } : { type: 'button' as const })}
      onClick={start}
      data-phase={phase}
      data-testid={testId}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-busy={phase === 'loading'}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className={cn(variant === 'cta' ? 'vh-cta' : 'vh-cta-quiet', 'vh-dyn', className)}
    >
      <span aria-hidden="true" className="vh-dyn-fill" />
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
            <span aria-hidden="true" className="vh-spin" />
          ) : phase === 'done' ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-[1.05em]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <m.path
                d="M4 10.5l4 4 8-9"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.34, delay: 0.08 }}
              />
            </svg>
          ) : (
            children
          )}
          {label}
        </m.span>
      </AnimatePresence>
    </Component>
  );
}
