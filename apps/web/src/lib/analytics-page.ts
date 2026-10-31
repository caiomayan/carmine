import { type AnalyticsRoute, analyticsRouteOf } from '@carmine/contracts/analytics-routes';
import { isCountedPath } from './analytics-paths';

/**
 * O `pagina_vista` (plano de eventos, evento 1): o que sai de cada navegação do site, e só isso. Funções puras e
 * sem Zod (o módulo de rotas do contrato também não tem): o que o navegador manda é montado aqui, nunca copiado da
 * URL. Nada do endereço cru (caminho, ID público, SteamID, `?consulta`, `#âncora`) sai: `/10016?x=1#a` vira a rota
 * `perfil`.
 */

export { isCountedPath };

/** As propriedades do `pagina_vista` (as do contrato `ANALYTICS_EVENTS.pagina_vista`). */
export interface PageViewProperties {
  rota: AnalyticsRoute;
  modo: 'retake' | 'deathmatch' | null;
  logado: boolean;
  referenciador: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

const UTM = /^[a-z0-9_-]{1,40}$/;

/** `utm_*` só vale com letras minúsculas, números, `_` e `-` (até 40); qualquer outra coisa vira `null`. */
export function cleanUtm(value: string | null): string | null {
  return value !== null && UTM.test(value) ? value : null;
}

const REFERRER_MAX = 80;

/**
 * De onde a pessoa veio: o domínio do site de origem (`discord.com`), `direto` sem referenciador (ou ilegível) e
 * `interno` se veio do próprio site. Só o domínio: caminho e consulta do site de origem nunca saem.
 */
export function referrerLabel(referrer: string, siteHost: string): string {
  if (referrer === '') return 'direto';
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'direto';
  }
  if (host === '') return 'direto';
  const bare = (value: string) => value.replace(/^www\./, '');
  if (bare(host) === bare(siteHost.toLowerCase().split(':', 1)[0] ?? '')) return 'interno';
  return bare(host).slice(0, REFERRER_MAX);
}

/** O Modo só vale no Ranking, vindo de `?modo=`; qualquer outro valor (ou outra página) é `null`. */
function modeOf(route: AnalyticsRoute, params: URLSearchParams): PageViewProperties['modo'] {
  if (route !== 'ranking') return null;
  const value = params.get('modo');
  return value === 'retake' || value === 'deathmatch' ? value : null;
}

/**
 * As propriedades de uma página vista, ou `null` se ela não conta (`/staff`, `/dev`, `/healthz`).
 * `referrer` é o `document.referrer` na primeira página; nas navegações seguintes dentro do site, `interno`.
 */
export function pageViewOf({
  pathname,
  search,
  referrer,
  siteHost,
  loggedIn,
}: {
  pathname: string;
  search: string;
  referrer: string;
  siteHost: string;
  loggedIn: boolean;
}): PageViewProperties | null {
  if (!isCountedPath(pathname)) return null;
  const params = new URLSearchParams(search);
  const rota = analyticsRouteOf(pathname);
  return {
    rota,
    modo: modeOf(rota, params),
    logado: loggedIn,
    referenciador: referrerLabel(referrer, siteHost),
    utm_source: cleanUtm(params.get('utm_source')),
    utm_medium: cleanUtm(params.get('utm_medium')),
    utm_campaign: cleanUtm(params.get('utm_campaign')),
  };
}

/** As propriedades comuns a todo evento do plano (seção 1.1). */
export function commonProperties(config: { planVersion: string; environment: string }) {
  return {
    versao_plano: config.planVersion,
    ambiente: config.environment,
    origem_evento: 'web',
  } as const;
}

/** O aparelho, no vocabulário do PostHog (`$browser`, `$os`, `$device_type`): só famílias, nunca o agente cru. */
export interface DeviceProperties {
  $browser: string;
  $os: string;
  $device_type: 'Desktop' | 'Mobile' | 'Tablet';
}

/**
 * Deriva navegador, sistema e tipo de aparelho do agente do navegador. O agente em si nunca sai: só a família
 * (`Chrome`, `Windows`, `Mobile`). `touch` distingue o iPad (que se anuncia como Mac) de um Mac.
 */
export function deviceOf(userAgent: string, touch: boolean): DeviceProperties {
  const ua = userAgent;
  let os = 'Other';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch)) os = 'iOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'Mac OS X';
  else if (/CrOS/.test(ua)) os = 'Chrome OS';
  else if (/Linux|X11/.test(ua)) os = 'Linux';

  let browser = 'Other';
  if (ua.includes('Edg/') || ua.includes('EdgA/') || ua.includes('EdgiOS/'))
    browser = 'Microsoft Edge';
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
  else if (ua.includes('SamsungBrowser')) browser = 'Samsung Internet';
  else if (ua.includes('Firefox/') || ua.includes('FxiOS')) browser = 'Firefox';
  else if (ua.includes('Chrome/') || ua.includes('CriOS')) browser = 'Chrome';
  else if (ua.includes('Safari/')) browser = 'Safari';

  let device: DeviceProperties['$device_type'] = 'Desktop';
  if (
    /iPad|Tablet/.test(ua) ||
    (os === 'iOS' && !/iPhone|iPod/.test(ua)) ||
    (/Android/.test(ua) && !/Mobile/.test(ua))
  ) {
    device = 'Tablet';
  } else if (/Mobi|iPhone|iPod|Android/.test(ua)) {
    device = 'Mobile';
  }
  return { $browser: browser, $os: os, $device_type: device };
}

const BOT =
  /bot|crawl|spider|slurp|headless|lighthouse|prerender|phantom|python|curl|wget|facebookexternalhit|bingpreview/i;

/** Robô (agente conhecido ou navegador automatizado): não entra na contagem. */
export function isBot(userAgent: string, webdriver: boolean): boolean {
  return webdriver || BOT.test(userAgent);
}

/** O identificador anônimo do modo sem cookies: o PostHog troca por um hash do dia calculado no servidor. */
export const COOKIELESS_DISTINCT_ID = '$posthog_cookieless';

/** O endpoint de captura do PostHog (um evento por pedido), relativo ao host de ingestão. */
export const CAPTURE_PATH = '/i/v0/e/';

/**
 * O corpo do pedido de captura do `pagina_vista`, montado do zero: só as propriedades do plano (com as comuns), o
 * aparelho em famílias e o que o PostHog precisa para o modo sem cookies (`distinct_id` e `$cookieless_mode`, sem pessoa).
 * Nada da URL, do referenciador cru nem do agente do navegador entra: não há o que filtrar depois.
 */
export function captureBody({
  key,
  view,
  device,
  planVersion,
  environment,
  uuid,
  at,
}: {
  key: string;
  view: PageViewProperties;
  device: DeviceProperties;
  planVersion: string;
  environment: string;
  uuid: string;
  at: Date;
}) {
  return {
    api_key: key,
    event: 'pagina_vista',
    distinct_id: COOKIELESS_DISTINCT_ID,
    uuid,
    timestamp: at.toISOString(),
    properties: {
      token: key,
      ...view,
      ...commonProperties({ planVersion, environment }),
      ...device,
      $lib: 'carmine-web',
      $lib_version: '1',
      $insert_id: uuid,
      $cookieless_mode: true,
      $process_person_profile: false,
    },
  };
}
