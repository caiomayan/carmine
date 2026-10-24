'use client';

import { useEffect } from 'react';

/**
 * Efeitos de ponteiro do redesenho "Vida", num só ouvinte para a página toda: o spotlight (`.v-spot`,
 * variáveis --px/--py) e a inclinação 3D com o brilho que acompanha o ponteiro (`.v-tilt`, variáveis
 * --rx/--ry/--hx/--hy). Com movimento reduzido não há inclinação; toque não inclina.
 */
export function Effects() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last: PointerEvent | null = null;

    const apply = () => {
      frame = 0;
      const event = last;
      const target = event?.target;
      if (!event || !(target instanceof Element)) return;
      const spot = target.closest<HTMLElement>('.v-spot');
      if (spot) {
        const box = spot.getBoundingClientRect();
        spot.style.setProperty('--px', `${event.clientX - box.left}px`);
        spot.style.setProperty('--py', `${event.clientY - box.top}px`);
      }
      const holo = target.closest<HTMLElement>('.v-holo');
      if (holo && !holo.classList.contains('v-tilt') && event.pointerType !== 'touch') {
        const hb = holo.getBoundingClientRect();
        holo.dataset.hot = '';
        holo.style.setProperty(
          '--hx',
          `${(((event.clientX - hb.left) / hb.width) * 100).toFixed(1)}%`,
        );
        holo.style.setProperty(
          '--hy',
          `${(((event.clientY - hb.top) / hb.height) * 100).toFixed(1)}%`,
        );
      }
      if (reduce.matches || event.pointerType === 'touch') return;
      const tilt = target.closest<HTMLElement>('.v-tilt');
      if (!tilt) return;
      const box = tilt.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      tilt.dataset.hot = '';
      tilt.style.setProperty('--rx', `${((0.5 - y) * 12).toFixed(2)}deg`);
      tilt.style.setProperty('--ry', `${((x - 0.5) * 14).toFixed(2)}deg`);
      tilt.style.setProperty('--hx', `${(x * 100).toFixed(1)}%`);
      tilt.style.setProperty('--hy', `${(y * 100).toFixed(1)}%`);
    };

    const onMove = (event: PointerEvent) => {
      last = event;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onOut = (event: PointerEvent) => {
      const holoOnly = (event.target as Element | null)?.closest?.<HTMLElement>('.v-holo');
      if (holoOnly && !holoOnly.contains(event.relatedTarget as Node | null))
        delete holoOnly.dataset.hot;
      const tilt = (event.target as Element | null)?.closest?.<HTMLElement>('.v-tilt');
      if (!tilt || tilt.contains(event.relatedTarget as Node | null)) return;
      delete tilt.dataset.hot;
      tilt.style.setProperty('--rx', '0deg');
      tilt.style.setProperty('--ry', '0deg');
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
