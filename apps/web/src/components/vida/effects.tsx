'use client';

import { useEffect } from 'react';

/**
 * Efeitos de ponteiro do redesenho "Vida", num só ouvinte para a página toda: o spotlight (`.v-spot`, variáveis
 * --tx/--ty, o deslocamento do centro) e a inclinação 3D com o brilho que acompanha o ponteiro (`.v-tilt`, variáveis
 * --rx/--ry/--hx/--hy). Com movimento reduzido não há inclinação; toque não inclina.
 *
 * Por movimento o ouvinte só ESCREVE variáveis: o retângulo do elemento é medido uma vez, quando o ponteiro entra, e
 * guardado até a rolagem, o redimensionamento ou a saída. Ler `getBoundingClientRect` depois de escrever no quadro
 * anterior forçava recálculo de estilo e layout síncronos a cada movimento.
 */
export function Effects() {
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last: PointerEvent | null = null;

    const rects = new Map<Element, DOMRect>();
    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) rects.delete(entry.target);
    });
    const measure = (el: Element) => {
      let box = rects.get(el);
      if (!box) {
        box = el.getBoundingClientRect();
        rects.set(el, box);
        resize.observe(el);
      }
      return box;
    };
    const forget = (el: Element) => {
      rects.delete(el);
      resize.unobserve(el);
    };
    const flush = () => rects.clear();

    const heat = (el: HTMLElement) => {
      if (el.dataset.hot === undefined) el.dataset.hot = '';
    };

    const apply = () => {
      frame = 0;
      const event = last;
      const target = event?.target;
      if (!event || !(target instanceof Element)) return;
      const spot = target.closest<HTMLElement>('.v-spot');
      if (spot) {
        const box = measure(spot);
        spot.style.setProperty(
          '--tx',
          `${(event.clientX - box.left - box.width / 2).toFixed(1)}px`,
        );
        spot.style.setProperty(
          '--ty',
          `${(event.clientY - box.top - box.height / 2).toFixed(1)}px`,
        );
      }
      const holo = target.closest<HTMLElement>('.v-holo');
      if (holo && !holo.classList.contains('v-tilt') && event.pointerType !== 'touch') {
        const hb = measure(holo);
        heat(holo);
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
      const box = measure(tilt);
      const x = (event.clientX - box.left) / box.width;
      const y = (event.clientY - box.top) / box.height;
      heat(tilt);
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
      const from = event.target instanceof Element ? event.target : null;
      const to = event.relatedTarget as Node | null;
      for (const selector of ['.v-spot', '.v-holo', '.v-tilt']) {
        const el = from?.closest<HTMLElement>(selector);
        if (el && !el.contains(to)) forget(el);
      }
      const holoOnly = from?.closest<HTMLElement>('.v-holo');
      if (holoOnly && !holoOnly.contains(to)) delete holoOnly.dataset.hot;
      const tilt = from?.closest<HTMLElement>('.v-tilt');
      if (!tilt || tilt.contains(to)) return;
      delete tilt.dataset.hot;
      tilt.style.setProperty('--rx', '0deg');
      tilt.style.setProperty('--ry', '0deg');
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    window.addEventListener('scroll', flush, { passive: true, capture: true });
    window.addEventListener('resize', flush, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      window.removeEventListener('scroll', flush, { capture: true });
      window.removeEventListener('resize', flush);
      resize.disconnect();
      rects.clear();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
