'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { loadHeaderView } from '@/lib/header-previews/client';
import type { HeaderView } from '@/lib/header-previews/view';

type PreviewData = {
  status: 'loading' | 'ready' | 'error';
  /** A última leitura boa: continua na tela enquanto uma nova chega ou se ela falha. */
  view: HeaderView | null;
  retry: () => void;
};

const PreviewDataContext = createContext<PreviewData | null>(null);

/**
 * Os dados dos painéis: lidos uma vez no primeiro hover (o `HeaderNav` já aquece a leitura) e
 * relidos quando um painel abre, se a leitura anterior ficou velha (`loadHeaderView` cuida disso).
 * Uma falha com uma leitura boa na mão não apaga o painel: ele fica com o que tinha.
 */
export function PreviewDataProvider({ open, children }: { open: boolean; children: ReactNode }) {
  const [state, setState] = useState<Pick<PreviewData, 'status' | 'view'>>({
    status: 'loading',
    view: null,
  });
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `open` e `attempt` são os gatilhos
  useEffect(() => {
    let alive = true;
    loadHeaderView({ force: attempt > 0 }).then((view) => {
      if (!alive) return;
      setState((current) =>
        view
          ? { status: 'ready', view }
          : { status: current.view ? 'ready' : 'error', view: current.view },
      );
    });
    return () => {
      alive = false;
    };
  }, [open, attempt]);

  const retry = useCallback(() => {
    setState((current) => ({ ...current, status: 'loading' }));
    setAttempt((n) => n + 1);
  }, []);

  return (
    <PreviewDataContext.Provider value={{ ...state, retry }}>
      {children}
    </PreviewDataContext.Provider>
  );
}

export function usePreviewData(): PreviewData {
  const context = useContext(PreviewDataContext);
  if (!context) throw new Error('usePreviewData fora do PreviewDataProvider');
  return context;
}
