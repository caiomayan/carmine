'use client';

import { useSyncExternalStore } from 'react';

/**
 * Se a media query vale agora. No servidor e na hidratação é `false`: quem usa começa pela versão
 * "pequena" e corrige no cliente, sem divergir do HTML que o servidor mandou.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}
