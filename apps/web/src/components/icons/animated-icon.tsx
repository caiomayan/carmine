'use client';

import {
  type ComponentType,
  type HTMLAttributes,
  type RefAttributes,
  useEffect,
  useRef,
} from 'react';
import { cn } from '@/lib/utils';

/** O contrato imperativo comum a todos os ícones do lucide-animated. */
export type AnimatedIconHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

export type AnimatedIconComponent = ComponentType<
  HTMLAttributes<HTMLSpanElement> & { size?: number } & RefAttributes<AnimatedIconHandle>
>;

/** Controles que disparam a animação do ícone que está dentro deles. */
const TRIGGER = 'a, button, [role="button"], [role="tab"], [role="menuitem"], [data-icon-trigger]';

const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Ícone do lucide-animated que anima quando o controle pai recebe hover ou foco de teclado,
 * não só quando o ponteiro passa sobre o próprio desenho. Com movimento reduzido o ícone fica
 * parado (nem o lucide-animated nem o Motion tratam isso nos ícones). Sempre decorativo: o
 * nome acessível fica no controle.
 */
export function AnimatedIcon({
  icon: Icon,
  size = 16,
  className,
}: {
  icon: AnimatedIconComponent;
  size?: number;
  className?: string;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const iconRef = useRef<AnimatedIconHandle>(null);

  useEffect(() => {
    const trigger = rootRef.current?.closest<HTMLElement>(TRIGGER);
    if (!trigger) return;

    // Ícone oculto (ex.: o sol no tema claro) não anima: não há o que ver.
    const start = () => {
      const visible = rootRef.current?.checkVisibility() ?? false;
      if (visible && !prefersReducedMotion()) iconRef.current?.startAnimation();
    };
    const stop = () => iconRef.current?.stopAnimation();
    // Foco por clique não anima: só o foco visível (teclado) conta como intenção.
    const onFocus = () => {
      if (trigger.matches(':focus-visible')) start();
    };

    trigger.addEventListener('pointerenter', start);
    trigger.addEventListener('pointerleave', stop);
    trigger.addEventListener('focus', onFocus);
    trigger.addEventListener('blur', stop);
    return () => {
      trigger.removeEventListener('pointerenter', start);
      trigger.removeEventListener('pointerleave', stop);
      trigger.removeEventListener('focus', onFocus);
      trigger.removeEventListener('blur', stop);
    };
  }, []);

  return (
    <span ref={rootRef} aria-hidden="true" className={cn('inline-flex shrink-0', className)}>
      <Icon ref={iconRef} size={size} className="inline-flex" />
    </span>
  );
}
