'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/**
 * Todo o app anima sob reducedMotion="user": com prefers-reduced-motion o Motion desliga
 * transformações e layout (ficam opacidade e cor). Animate UI e lucide-animated não tratam
 * isso sozinhos (ADR 0014).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
