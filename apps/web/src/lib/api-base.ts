import { profileLocationSchema } from '@carmine/contracts/profile';

/**
 * Chamadas do servidor do web à API, pela rede interna (`API_URL`; ADR 0015). Usado pelos
 * Server Components e pelo proxy; o navegador sempre fala com `/api` na própria origem.
 */
const TIMEOUT_MS = 3000;

export function apiBaseUrl(): string {
  return (process.env.API_URL ?? 'http://localhost:3333').replace(/\/+$/, '');
}

/**
 * Cabeçalho com o IP do visitante. Em produção o web recebe do cloudflared (o Cloudflare o
 * define e sobrescreve) e o repassa à API, que só o aceita vindo de um proxy confiável
 * (`TRUSTED_PROXIES`, que inclui o web): assim o rate limit por IP das chamadas dos Server
 * Components conta o visitante, não o contêiner do web. Sem túnel, não existe e não vai.
 */
export const VISITOR_IP_HEADER = 'cf-connecting-ip';

export interface ApiRequestInit {
  cookie?: string;
  /** O `cf-connecting-ip` que chegou ao web, se chegou. */
  visitorIp?: string | null;
}

export function apiRequestHeaders(init: ApiRequestInit = {}): Record<string, string> {
  return {
    accept: 'application/json',
    ...(init.cookie ? { cookie: init.cookie } : {}),
    ...(init.visitorIp ? { [VISITOR_IP_HEADER]: init.visitorIp } : {}),
  };
}

export async function apiGet(path: string, init?: ApiRequestInit): Promise<Response> {
  return fetch(`${apiBaseUrl()}/api${path}`, {
    headers: apiRequestHeaders(init),
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** O ID público da Conta de um SteamID64; `null` se não há Conta, `undefined` se a API falhou. */
export async function findPublicIdBySteamId(
  steamId: string,
  visitorIp: string | null,
): Promise<number | null | undefined> {
  try {
    const response = await apiGet(`/profiles/by-steam-id/${steamId}`, { visitorIp });
    if (response.status === 404) return null;
    if (!response.ok) return undefined;
    return profileLocationSchema.parse(await response.json()).publicId;
  } catch {
    return undefined;
  }
}
