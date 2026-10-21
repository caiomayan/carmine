'use client';

import type { LoadoutSide } from '@carmine/contracts';
import { useCallback, useSyncExternalStore } from 'react';
import { readLastSide, writeLastSide } from '@/lib/loadout/last-side';

const listeners = new Set<() => void>();
/** A escolha desta visita, para valer mesmo quando o navegador não deixa guardar. */
let chosen: LoadoutSide | null = null;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = () => {
    chosen = null;
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * O lado do Loadout (TR ou CT) que a pessoa usou por último. No servidor e na hidratação vale CT;
 * o lado guardado entra logo depois, no cliente. Mudar de lado guarda a escolha para a próxima visita.
 */
export function useLastSide(): [LoadoutSide, (side: LoadoutSide) => void] {
  const side = useSyncExternalStore(
    subscribe,
    () => chosen ?? readLastSide(storage()),
    () => 'ct' as const,
  );
  const setSide = useCallback((next: LoadoutSide) => {
    chosen = next;
    writeLastSide(storage(), next);
    for (const listener of listeners) listener();
  }, []);
  return [side, setSide];
}
