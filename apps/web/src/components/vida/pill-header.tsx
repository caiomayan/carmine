'use client';

import { useEffect } from 'react';

const KEY = 'vida-header';
export type HeaderMode = 'pill' | 'normal';

/** O modo guardado no navegador (padrão: pílula). Lê com cuidado: o armazenamento pode não existir. */
export function readHeaderMode(): HeaderMode {
  try {
    return window.localStorage.getItem(KEY) === 'normal' ? 'normal' : 'pill';
  } catch {
    return 'pill';
  }
}

export function applyHeaderMode(mode: HeaderMode) {
  document.documentElement.dataset.vheader = mode;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // sem armazenamento: vale só nesta página
  }
}

/**
 * Header que vira pílula flutuante ao rolar (a ideia do Floating Pill Nav), como alternativa ao fundo com
 * desfoque: depois de 40 px de rolagem o header encolhe numa pílula centrada e solta do topo (CSS em
 * vida.css, `[data-site-header]`). Este componente só liga o modo e marca `data-vpill` conforme a rolagem.
 */
export function PillHeaderController() {
  useEffect(() => {
    applyHeaderMode(readHeaderMode());
    let ticking = false;
    const update = () => {
      ticking = false;
      document.documentElement.dataset.vpill = window.scrollY > 40 ? 'on' : 'off';
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return null;
}
