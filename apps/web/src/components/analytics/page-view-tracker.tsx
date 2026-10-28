'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useSyncExternalStore } from 'react';
import { useSession } from '@/components/session/session-provider';
import {
  commonProperties,
  type PageViewProperties,
  pageViewOf,
  sanitizeEvent,
} from '@/lib/analytics-page';
import {
  getParticipation,
  setParticipation,
  subscribeParticipation,
} from '@/lib/analytics-participation';
import { parseAnalyticsPreference } from '@/lib/api-guards';

export interface PageViewTrackerConfig {
  key: string;
  host: string;
  environment: string;
  planVersion: string;
}

type Client = {
  capture: (event: string, properties: Record<string, unknown>) => void;
};

/** Depois do `load` e de um respiro do navegador: a contagem nunca disputa a primeira carga nem o primeiro quadro. */
function afterLoadAndIdle(callback: () => void) {
  const idle = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(callback, { timeout: 4000 });
    else setTimeout(callback, 2000);
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

type PostHog = typeof import('posthog-js/dist/module.slim.no-external').default;

/**
 * A biblioteca é ESM num arquivo `.js` sem `type: module`: conforme o empacotador, o `default` do `import()` é o
 * cliente ou um objeto que o carrega em `default`/`posthog`. Aceita as duas formas.
 */
function posthogOf(module: unknown): PostHog {
  const holder = module as { default?: unknown; posthog?: unknown };
  const candidates = [holder.default, holder.posthog, (holder.default as typeof holder)?.default];
  const found = candidates.find(
    (candidate): candidate is PostHog =>
      typeof (candidate as PostHog | undefined)?.init === 'function',
  );
  if (!found) throw new Error('posthog-js: cliente não encontrado');
  return found;
}

/** A conexão com o PostHog é uma só por aba, aberta na primeira página contada. */
let loading: Promise<Client> | null = null;
/** `false` descarta o que a biblioteca ainda tem na fila (a Conta desligou a chave). */
let allowed = true;

function connect(config: PageViewTrackerConfig): Promise<Client> {
  loading ??= new Promise<Client>((resolve) => {
    console.info('[analytics] connect: esperando load e ocioso');
    afterLoadAndIdle(() => {
      console.info('[analytics] ocioso: importando a biblioteca');
      void import('posthog-js/dist/module.slim.no-external')
        .then((module) => {
          console.info('[analytics] biblioteca carregada', Object.keys(module as object).join(','));
          const posthog = posthogOf(module);
          posthog.init(config.key, {
            api_host: config.host,
            // Sem cookies e sem nada no aparelho: o PostHog calcula no servidor um identificador que não persiste.
            cookieless_mode: 'always',
            persistence: 'memory',
            person_profiles: 'never',
            // O único evento do navegador é o `pagina_vista`, disparado à mão: tudo o mais desligado.
            autocapture: false,
            capture_pageview: false,
            capture_pageleave: false,
            capture_dead_clicks: false,
            capture_heatmaps: false,
            capture_exceptions: false,
            disable_session_recording: true,
            disable_surveys: true,
            advanced_disable_flags: true,
            disable_external_dependency_loading: true,
            rageclick: false,
            before_send: (event) => (allowed ? sanitizeEvent(event) : null),
          });
          console.info(
            '[analytics] init feito; robô?',
            String((posthog as unknown as { _is_bot?: () => unknown })._is_bot?.()),
            'webdriver',
            String(navigator.webdriver),
          );
          resolve({
            capture: (event, properties) => {
              const result = posthog.capture(event, properties);
              console.info('[analytics] capture devolveu', String(result?.event));
            },
          });
        })
        .catch((error: unknown) => {
          // Sem a biblioteca não há contagem; a página nunca é afetada.
          console.warn('contagem de páginas indisponível', error);
        });
    });
  });
  return loading;
}

/**
 * A contagem de páginas (A1d, `pagina_vista`). Fica fora da primeira carga: a biblioteca do PostHog só é baixada
 * depois da hidratação e de o navegador ficar ocioso, e só se o servidor repassou a chave (`POSTHOG_API_KEY` em
 * tempo de execução). Conta cada navegação do App Router; nunca em `/staff`, `/dev` e `/healthz`; e não conta quem
 * está logado e desligou "Participar da análise de uso" (a preferência vem de `GET /api/me/analytics`, depois da
 * hidratação, sem bloquear nada). O que sai é montado em `analytics-page.ts`, sem a URL crua.
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
    console.info('[analytics] efeito', status, String(participates), pathname);
    if (!ready) return;
    const key = `${pathname}?${search}`;
    if (counted.current === key) return;
    // A primeira página leva o referenciador do navegador; as seguintes vieram do próprio site.
    const first = counted.current === null;
    const view: PageViewProperties | null = pageViewOf({
      pathname,
      search,
      referrer: first ? document.referrer : window.location.origin,
      siteHost: window.location.host,
      loggedIn: status === 'authenticated',
    });
    counted.current = key;
    if (!view) return;
    void connect(config).then((client) =>
      client.capture('pagina_vista', { ...view, ...commonProperties(config) }),
    );
  }, [ready, pathname, search, status, config]);

  return null;
}
