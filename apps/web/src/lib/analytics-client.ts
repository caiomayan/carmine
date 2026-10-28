import {
  CAPTURE_PATH,
  captureBody,
  deviceOf,
  isBot,
  type PageViewProperties,
  pageViewOf,
} from './analytics-page';

/**
 * O cliente mínimo da contagem de páginas (A1d): um `fetch` ao endpoint de captura do PostHog (UE) por página vista,
 * sem biblioteca, sem cookies, sem `localStorage` e sem fila. Só é baixado depois do `load` e de o navegador ficar
 * ocioso (`page-view-tracker.tsx`), então não pesa na primeira carga nem no quadro.
 */

export interface PageViewSink {
  key: string;
  /** Origem de ingestão do PostHog (UE), sem a barra final. */
  host: string;
  environment: string;
  planVersion: string;
}

/**
 * Manda o `pagina_vista` de uma página, se ela conta. `referrer` é o `document.referrer` na primeira página e a origem
 * do próprio site nas seguintes. Devolve `false` quando nada foi enviado (página fora da contagem ou robô).
 */
export function sendPageView(
  sink: PageViewSink,
  page: { pathname: string; search: string; first: boolean; loggedIn: boolean },
): boolean {
  const userAgent = navigator.userAgent;
  if (isBot(userAgent, navigator.webdriver === true)) return false;
  const view: PageViewProperties | null = pageViewOf({
    pathname: page.pathname,
    search: page.search,
    referrer: page.first ? document.referrer : window.location.origin,
    siteHost: window.location.host,
    loggedIn: page.loggedIn,
  });
  if (!view) return false;
  const body = captureBody({
    key: sink.key,
    view,
    device: deviceOf(userAgent, navigator.maxTouchPoints > 1),
    planVersion: sink.planVersion,
    environment: sink.environment,
    uuid: crypto.randomUUID(),
    at: new Date(),
  });
  // Corpo de texto (sem preflight de CORS), sem cookies, sem referenciador e sem cache: o pedido não carrega nada além do evento.
  void fetch(`${sink.host}${CAPTURE_PATH}`, {
    method: 'POST',
    body: JSON.stringify(body),
    keepalive: true,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  }).catch(() => {
    // Bloqueador de anúncios ou rede fora: some da contagem, sem erro para a página.
  });
  return true;
}
