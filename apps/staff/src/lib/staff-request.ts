'use client';

import { CSRF_COOKIE, CSRF_HEADER } from '@carmine/contracts';
import { staffErrorMessage } from './staff-errors';

export type StaffResult<T> = { ok: true; data: T } | { ok: false; message: string };

const readCookie = (name: string) =>
  document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

/**
 * Uma mutação do painel da Staff: JSON com o token CSRF (lido do cookie), resposta validada e o erro pelo código estável
 * da API, com o texto pronto para mostrar. Nunca lança.
 */
export async function staffPost<T>(
  path: `/api/staff/${string}`,
  body: unknown,
  parse: (value: unknown) => T,
  method: 'POST' | 'PUT' = 'POST',
): Promise<StaffResult<T>> {
  const csrf = readCookie(CSRF_COOKIE);
  try {
    const response = await fetch(path, {
      method,
      headers: { 'content-type': 'application/json', ...(csrf ? { [CSRF_HEADER]: csrf } : {}) },
      body: JSON.stringify(body),
    });
    const json: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: parse(json) };
    if (response.status === 401)
      return { ok: false, message: staffErrorMessage('unauthenticated') };
    const code =
      json && typeof json === 'object' && 'code' in json
        ? String((json as { code: unknown }).code)
        : undefined;
    return { ok: false, message: staffErrorMessage(code) };
  } catch {
    return { ok: false, message: staffErrorMessage('unknown') };
  }
}

/** Uma página da fila (GET), validada; `null` se a API recusou ou caiu. */
export async function staffGet<T>(
  path: `/api/staff/${string}`,
  parse: (value: unknown) => T,
): Promise<T | null> {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    return parse(await response.json());
  } catch {
    return null;
  }
}
