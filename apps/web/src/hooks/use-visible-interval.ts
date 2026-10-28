'use client';

import { useEffect, useRef } from 'react';
import { startVisibleInterval } from '@/lib/visible-interval';

/**
 * `callback` a cada `ms` só com a aba à vista; ao voltar, roda na hora uma vez (ver `startVisibleInterval`). O
 * `callback` mais novo é sempre o usado, sem recomeçar o intervalo a cada render. `ms` nulo desliga.
 */
export function useVisibleInterval(callback: () => void, ms: number | null): void {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    if (ms === null) return;
    return startVisibleInterval(() => latest.current(), ms);
  }, [ms]);
}
