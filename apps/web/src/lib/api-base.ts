import { profileLocationSchema } from '@carmine/contracts';

/**
 * Chamadas do servidor do web à API, pela rede interna (`API_URL`; ADR 0015). Usado pelos
 * Server Components e pelo proxy; o navegador sempre fala com `/api` na própria origem.
 */
const TIMEOUT_MS = 3000;

export function apiBaseUrl(): string {
  return (process.env.API_URL ?? 'http://localhost:3333').replace(/\/+$/, '');
}

export async function apiGet(path: string, init?: { cookie?: string }): Promise<Response> {
  return fetch(`${apiBaseUrl()}/api${path}`, {
    headers: { accept: 'application/json', ...(init?.cookie ? { cookie: init.cookie } : {}) },
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/** O ID público da Conta de um SteamID64; `null` se não há Conta, `undefined` se a API falhou. */
export async function findPublicIdBySteamId(steamId: string): Promise<number | null | undefined> {
  try {
    const response = await apiGet(`/profiles/by-steam-id/${steamId}`);
    if (response.status === 404) return null;
    if (!response.ok) return undefined;
    return profileLocationSchema.parse(await response.json()).publicId;
  } catch {
    return undefined;
  }
}
