'use client';

import { useEffect, useState } from 'react';

/**
 * "Agora" para os prazos: começa no relógio do servidor (a primeira pintura bate com o HTML) e anda de minuto em
 * minuto, só com a aba à vista. É um relógio de minutos, não uma animação: uma atualização de estado por minuto.
 */
export function useNow(serverNowMs: number): number {
  const [now, setNow] = useState(serverNowMs);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    const timer = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return now;
}
