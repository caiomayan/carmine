'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CopyStatus = 'idle' | 'copied' | 'failed';

/** Quanto tempo o "IP copiado" fica antes de o botão voltar ao normal. */
const RESET_MS = 2200;

/**
 * Copia um texto para a área de transferência e conta como foi. Sem permissão (ou fora de um
 * contexto seguro) vira `failed`: a tela pede para selecionar e copiar à mão.
 */
export function useCopy(): { status: CopyStatus; copy: (text: string) => Promise<boolean> } {
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (text: string) => {
    clearTimeout(timer.current);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {}
    setStatus(ok ? 'copied' : 'failed');
    if (ok) timer.current = setTimeout(() => setStatus('idle'), RESET_MS);
    return ok;
  }, []);

  return { status, copy };
}
