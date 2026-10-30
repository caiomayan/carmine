'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Atualiza os números do painel de tempos em tempos, só com a aba à vista (o painel mostra o agora, e os números
 * que mudam rolam). Não é animação: é um pedido ao servidor a cada `seconds`; aba escondida não pede nada, e ao voltar
 * a ficar à vista atualiza na hora.
 */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      last = Date.now();
      router.refresh();
    };
    const timer = setInterval(refresh, seconds * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last > seconds * 1000) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, seconds]);
  return null;
}
