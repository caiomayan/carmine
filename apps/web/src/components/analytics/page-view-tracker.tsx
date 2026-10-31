'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useSyncExternalStore } from 'react';
import { useSession } from '@/components/session/session-provider';
import {
  getParticipation,
  setParticipation,
  subscribeParticipation,
} from '@/lib/analytics-participation';
import { isCountedPath } from '@/lib/analytics-paths';
import { parseAnalyticsPreference } from '@/lib/api-guards';

export interface PageViewTrackerConfig {
  key: string;
  host: string;
  environment: string;
  planVersion: string;
}

/** Depois do `load` e de um respiro do navegador: a contagem nunca disputa a primeira carga nem o primeiro quadro. */
function afterLoadAndIdle(callback: () => void) {
  const idle = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout: 4000 });
    else setTimeout(callback, 2000);
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

/** `false` cancela o que ainda espera o respiro do navegador (a Conta desligou a chave). */
let allowed = true;

/**
 * A contagem de páginas (A1d, `pagina_vista`). Só esta casca fica na primeira carga (decide se conta); o cliente que
 * monta e envia o evento (`lib/analytics-client.ts`, um `fetch` ao PostHog, sem biblioteca) só é baixado depois do
 * `load` e de o navegador ficar ocioso, e só se o servidor repassou a chave (`POSTHOG_API_KEY` em tempo de execução).
 * Conta cada navegação do App Router; nunca em `/staff`, `/dev` e `/healthz`; e não conta quem está logado e desligou
 * "Participar da análise de uso" (a preferência vem de `GET /api/me/analytics`, depois da hidratação, sem bloquear
 * nada). Sem cookies nem armazenamento no aparelho.
 */
export function PageViewTracker({ config }: { config: PageViewTrackerConfig }) {
  return (
    <Suspense fallback={null}>
      <Tracker config={config} />
    </Suspense>
  );
}

function Tracker({ config }: { config: PageViewTrackerConfig }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { status } = useSession();
  const participates = useSyncExternalStore(subscribeParticipation, getParticipation, () => null);
  const counted = useRef<string | null>(null);

  // Quem está logado: a preferência vem da API, uma vez. Sem sessão, o valor de uma sessão anterior não vale.
  useEffect(() => {
    if (status === 'anonymous') setParticipation(null);
    if (status !== 'authenticated' || getParticipation() !== null) return;
    let cancelled = false;
    void fetch('/api/me/analytics', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: unknown) => {
        if (cancelled) return;
        // Sem resposta, na dúvida não conta: a privacidade ganha da estatística.
        setParticipation(parseAnalyticsPreference(json)?.participate ?? false);
      })
      .catch(() => {
        if (!cancelled) setParticipation(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const ready = status === 'anonymous' || (status === 'authenticated' && participates === true);

  useEffect(() => {
    allowed = ready;
    if (!ready) return;
    const key = `${pathname}?${search}`;
    if (counted.current === key) return;
    // A primeira página leva o referenciador do navegador; as seguintes vieram do próprio site.
    const first = counted.current === null;
    counted.current = key;
    if (!isCountedPath(pathname)) return;
    const loggedIn = status === 'authenticated';
    afterLoadAndIdle(() => {
      if (!allowed) return;
      void import('@/lib/analytics-client')
        .then(({ sendPageView }) => {
          if (allowed) sendPageView(config, { pathname, search, first, loggedIn });
        })
        .catch(() => {
          // Sem o cliente não há contagem; a página nunca é afetada.
        });
    });
  }, [ready, pathname, search, status, config]);

  return null;
}
