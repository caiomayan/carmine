import { type AnalyticsRoute, analyticsRouteOf } from '@carmine/contracts/analytics-routes';

/**
 * O `pagina_vista` (plano de eventos, evento 1): o que sai de cada navegação do site, e só isso. Funções puras e
 * sem Zod (o módulo de rotas do contrato também não tem): o que o navegador manda é montado aqui, nunca copiado da
 * URL. Nada do endereço cru (caminho, ID público, SteamID, `?consulta`, `#âncora`) sai: `/10016?x=1#a` vira a rota
 * `perfil`.
 */

/** As propriedades do `pagina_vista` (as do contrato `ANALYTICS_EVENTS.pagina_vista`, mais as comuns do plano). */
export interface PageViewProperties {
  rota: AnalyticsRoute;
  modo: 'retake' | 'deathmatch' | null;
  logado: boolean;
  referenciador: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

/** Fora do site público: a Staff, a vitrine interna, a checagem de saúde e a própria API. Nunca contam. */
const NOT_COUNTED = new Set(['staff', 'dev', 'healthz', 'api']);

/** O caminho conta como página vista? (`/staff`, `/dev`, `/healthz` e `/api` e o que vem abaixo deles, não.) */
export function isCountedPath(pathname: string): boolean {
  const first = pathname.split('/', 2)[1] ?? '';
  return !NOT_COUNTED.has(first.toLowerCase());
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

/**
 * O que a biblioteca coloca sozinha em todo evento e que é preciso manter: o que ela e o PostHog usam para
 * identificar o evento e tratar o modo sem cookies (`$cookieless_mode`, `distinct_id`), e o que o PostHog deriva do
 * aparelho (`$device_type`, `$browser`, `$os`). Todo o resto (`$current_url`, `$pathname`, `$host`, `$referrer`,
 * `$raw_user_agent`, `utm_*` crus, ids de clique, fuso, tela...) é descartado.
 */
const KEPT_LIBRARY_PROPERTIES = new Set([
  'token',
  'distinct_id',
  '$lib',
  '$lib_version',
  '$insert_id',
  '$time',
  '$cookieless_mode',
  '$process_person_profile',
  '$device_type',
  '$browser',
  '$os',
]);

const OWN_PROPERTIES = new Set([
  'rota',
  'modo',
  'logado',
  'referenciador',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'versao_plano',
  'ambiente',
  'origem_evento',
]);

interface CapturedEvent {
  event: string;
  properties?: Record<string, unknown>;
}

/**
 * O `before_send` da biblioteca: só o `pagina_vista` sai (qualquer outro evento é descartado) e só com as
 * propriedades do plano mais as da lista acima. É a rede de segurança: a URL crua que a biblioteca anexa a todo
 * evento nunca deixa o navegador.
 */
export function sanitizeEvent<T extends CapturedEvent>(event: T | null): T | null {
  if (!event || event.event !== 'pagina_vista') return null;
  const properties: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(event.properties ?? {})) {
    if (OWN_PROPERTIES.has(name) || KEPT_LIBRARY_PROPERTIES.has(name)) properties[name] = value;
  }
  // Sem `$set`/`$set_once` (não há pessoa) e sem nenhum outro campo solto do evento.
  const { uuid, timestamp } = event as { uuid?: unknown; timestamp?: unknown };
  return { event: event.event, uuid, timestamp, properties } as unknown as T;
}
