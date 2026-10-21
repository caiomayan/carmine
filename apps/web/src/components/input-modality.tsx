'use client';

import { useEffect } from 'react';

/** Teclas que movem o foco sem digitar: com elas o foco vem do teclado. */
const NAVIGATION_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * Marca no `<html>` (`data-kbd`) que o foco está sendo movido pelo teclado. O anel de foco do site
 * só aparece nesse modo: mouse e toque nunca o mostram, nem num campo de texto (que o navegador
 * trata como `:focus-visible` mesmo depois de um clique). Tab e as setas ligam o modo (as setas só
 * fora de campos, onde elas movem o cursor); qualquer clique ou toque o desliga.
 */
export function InputModality() {
  useEffect(() => {
    const root = document.documentElement;
    const on = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!NAVIGATION_KEYS.has(event.key)) return;
      if (event.key !== 'Tab' && isEditable(event.target)) return;
      root.setAttribute('data-kbd', '');
    };
    const off = () => root.removeAttribute('data-kbd');
    document.addEventListener('keydown', on, true);
    document.addEventListener('pointerdown', off, true);
    document.addEventListener('touchstart', off, true);
    return () => {
      document.removeEventListener('keydown', on, true);
      document.removeEventListener('pointerdown', off, true);
      document.removeEventListener('touchstart', off, true);
      off();
    };
  }, []);

  return null;
}
