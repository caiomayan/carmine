import { cookies } from 'next/headers';

/** A API pela rede interna (o painel serve o `/api` do navegador pelo túnel; aqui é o servidor falando com ela). */
const API_URL = (process.env.API_URL ?? 'http://localhost:3333').replace(/\/+$/, '');

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; data: null };

/**
 * GET na API repassando o cookie da sessão do navegador. Sem cache (o painel mostra o agora) e sem lançar: a tela
 * decide o que mostrar quando a API está fora ou nega (401, 403).
 */
export async function apiGet<T>(path: string): Promise<ApiResult<T>> {
  try {
    const cookie = (await cookies()).toString();
    const response = await fetch(`${API_URL}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ok: false, status: response.status, data: null };
    return { ok: true, status: response.status, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}
