'use client';

import { useReducedMotion } from 'framer-motion';
import { revealMotion } from './motion';

/** `revealMotion` já de acordo com `prefers-reduced-motion`: espalhe no `m.div` que abre e fecha. */
export function useRevealMotion() {
  return revealMotion(useReducedMotion() ?? false);
}
