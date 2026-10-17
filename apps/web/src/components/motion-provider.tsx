'use client';

import { LazyMotion, MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * As funcionalidades do Motion (animação, gestos, layout) chegam num chunk à parte, depois da
 * hidratação: o bundle da primeira carga leva só o `m` mínimo, e os componentes aparecem no
 * estado inicial até o chunk chegar. `strict` derruba quem importar o `motion` completo, que
 * traria tudo de volta para a primeira carga.
 */
const loadFeatures = () => import('@/lib/motion-features').then((module) => module.default);

/**
 * Todo o app anima sob reducedMotion="user": com prefers-reduced-motion o Motion desliga
 * transformações e layout (ficam opacidade e cor). Animate UI e lucide-animated não tratam
 * isso sozinhos (ADR 0014).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
