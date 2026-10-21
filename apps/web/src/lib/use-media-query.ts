'use client';

import { useSyncExternalStore } from 'react';

/**
 * Se a media query vale agora. No servidor (e na hidratação) vale `server`; o CSS é quem
 * desenha a tela, isto só decide o que o JavaScript faz (qual coluna o teclado alcança).
 */
export function useMediaQuery(query: string, server = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => matchMedia(query).matches,
    () => server,
  );
}
