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
 *
 * Desempenho: a mola do framer-motion não declara repouso (cada quadro segue emitindo valores a milésimos do alvo), e
 * escrever `textContent` troca o nó de texto, o que invalida o `:root:has([data-vida])` e refaz estilo e layout da
 * página inteira. Parado, isso era centenas de escritas por segundo do mesmo número. Por isso só se escreve quando o
 * texto muda e, quando o arredondado já é o do alvo, a mola é encerrada (`jump`), o que para o laço de quadros.
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
  /** O alvo atual da mola e o texto que está na tela. */
  const target = useRef(value);
  const shown = useRef('');
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
      const node = ref.current;
      if (!node) return;
      const text = `${format.format(Number(v.toFixed(decimals)))}${suffix}`;
      if (shown.current === text) return;
      shown.current = text;
      node.textContent = text;
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

  useEffect(
    () =>
      spring.on('change', (latest) => {
        write(latest);
        // A mola se aproxima sem ultrapassar (amortecimento acima do crítico): a menos de um quarto da última casa o
        // número na tela já é o do alvo, então encerra a mola em vez de deixá-la emitindo quadros para sempre.
        const goal = target.current;
        if (latest !== goal && Math.abs(latest - goal) < 0.25 * 10 ** -decimals) {
          spring.jump(goal);
        }
      }),
    [spring, write, decimals],
  );

  useEffect(() => {
    if (reduced.current) {
      write(value);
      return;
    }
    if (!inView) return;
    target.current = value;
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
