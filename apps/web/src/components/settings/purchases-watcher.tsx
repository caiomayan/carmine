'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/** Releitura nos primeiros minutos (o pagamento costuma confirmar em segundos) e mais espaçada depois. */
const FAST_MS = 4_000;
const SLOW_MS = 10_000;
const FAST_FOR_MS = 60_000;

/**
 * Enquanto há uma compra esperando o pagamento, pede ao servidor para ler de novo (`router.refresh`):
 * a página é de Server Component, e a API pergunta ao provedor a cada leitura de uma compra pendente.
 * Então o navegador não valida nada (sem o Zod no cliente) e a tela muda sozinha quando o pagamento
 * confirma, expira ou é recusado. Pausa com a aba escondida e relê assim que ela volta.
 */
export function PurchasesWatcher({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const wait = Date.now() - startedAt < FAST_FOR_MS ? FAST_MS : SLOW_MS;
      timer = setTimeout(() => {
        if (!document.hidden) router.refresh();
        schedule();
      }, wait);
    };
    const onVisible = () => {
      if (!document.hidden) router.refresh();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, router]);

  return null;
}
