'use client';

import { type RefObject, useLayoutEffect, useRef } from 'react';

/**
 * FLIP para as linhas de uma fila: quando a ordem, o filtro ou a página mudam (`signature`), cada elemento com
 * `data-flip-key` que já existia desliza da posição antiga para a nova. Anima só `transform` (Web Animations, no
 * compositor), uma vez, disparada pela ação da pessoa; sem movimento, nada (`prefers-reduced-motion`). Os elementos
 * novos entram pela animação de entrada do CSS.
 */
export function useFlip(container: RefObject<HTMLElement | null>, signature: string) {
  const previous = useRef(new Map<string, DOMRect>());

  // biome-ignore lint/correctness/useExhaustiveDependencies: só a assinatura (ordem, filtro, página) dispara a medição.
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = new Map<string, DOMRect>();
    for (const node of root.querySelectorAll<HTMLElement>('[data-flip-key]')) {
      const key = node.dataset.flipKey;
      if (!key || node.offsetParent === null) continue;
      const rect = node.getBoundingClientRect();
      next.set(key, rect);
      const before = previous.current.get(key);
      if (!before || reduce) continue;
      const dx = before.left - rect.left;
      const dy = before.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      node.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
    previous.current = next;
  }, [signature]);
}
