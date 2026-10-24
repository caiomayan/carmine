'use client';

import { useInView, useMotionValue, useSpring } from 'framer-motion';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import './ticker.css';

/**
 * Número que conta, na ideia do Number Ticker do Magic UI (MIT; reimplementado aqui): ao entrar na tela o valor
 * sobe de 0 até o alvo numa mola (damping 60, stiffness 100) e, a cada mudança do valor, rola até o novo.
 * Formata em pt-BR. O texto de verdade (leitor de tela e antes da hidratação) é o valor final; com movimento
 * reduzido o número só aparece. Usa o `framer-motion` do site (no lugar do `motion`).
 */
export function Ticker({
  value,
  decimals = 0,
  suffix = '',
  className,
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  /** Mantido por compatibilidade; a mola decide o tempo. */
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [initial] = useState(value);
  const reduced = useRef(false);
  const seen = useRef(false);
  const started = useRef(false);
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const inView = useInView(ref, { once: true, margin: '0px' });
  const format = useMemo(
    () =>
      new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    [decimals],
  );
  const write = useCallback(
    (v: number) => {
      if (ref.current)
        ref.current.textContent = `${format.format(Number(v.toFixed(decimals)))}${suffix}`;
    },
    [format, decimals, suffix],
  );

  // Antes da primeira pintura: se vai contar, começa do zero.
  useLayoutEffect(() => {
    if (started.current) return;
    started.current = true;
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced.current) return;
    write(0);
  }, [write]);

  useEffect(() => spring.on('change', (latest) => write(latest)), [spring, write]);

  useEffect(() => {
    if (reduced.current) {
      write(value);
      return;
    }
    if (!inView) return;
    if (!seen.current) {
      seen.current = true;
      motionValue.set(value);
      return;
    }
    const el = ref.current;
    if (el) {
      el.classList.remove('v-tick-up');
      void el.offsetWidth;
      el.classList.add('v-tick-up');
    }
    motionValue.set(value);
  }, [value, inView, write, motionValue]);

  return (
    <>
      <span
        ref={ref}
        aria-hidden="true"
        className={cn('tabular-nums', className)}
        suppressHydrationWarning
      >
        {`${format.format(initial)}${suffix}`}
      </span>
      <span className="sr-only">{`${format.format(value)}${suffix}`}</span>
    </>
  );
}
