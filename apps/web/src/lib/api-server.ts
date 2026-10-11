import {
  type CurrentSession,
  currentSessionSchema,
  type Profile,
  profileSchema,
} from '@carmine/contracts';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { apiGet, VISITOR_IP_HEADER } from './api-base';

/**
 * Sessão e Perfil lidos pelos Server Components, repassando o cookie da sessão (ADR 0015). Um
 * `Set-Cookie` de renovação que a API mande aqui não chega ao navegador: quem renova a sessão
 * é o `/api/me` do navegador.
 */

/** O IP do visitante que o cloudflared entregou ao web (ver `VISITOR_IP_HEADER`). */
export async function visitorIp(): Promise<string | null> {
  return (await headers()).get(VISITOR_IP_HEADER);
}

/** Nome do cookie da sessão na API (`__Host-`, httpOnly); o web só o repassa. */
export const SESSION_COOKIE = '__Host-carmine_session';

/**
 * A sessão como o servidor a vê nesta requisição. `unknown` quando a API não respondeu: a
 * barra superior não afirma que a pessoa saiu e o navegador tenta de novo.
 */
export type ServerSession =
  | { status: 'authenticated'; session: CurrentSession }
  | { status: 'anonymous' }
  | { status: 'unknown' };

export const getServerSession = cache(async (): Promise<ServerSession> => {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) return { status: 'anonymous' };
  try {
    const response = await apiGet('/me', {
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
      visitorIp: await visitorIp(),
    });
    if (response.status === 401) return { status: 'anonymous' };
    if (!response.ok) return { status: 'unknown' };
    return { status: 'authenticated', session: currentSessionSchema.parse(await response.json()) };
  } catch {
    return { status: 'unknown' };
  }
});

export type ProfileResult =
  | { status: 'found'; profile: Profile }
  | { status: 'not-found' }
  | { status: 'unavailable' };

export const getProfile = cache(async (publicId: number): Promise<ProfileResult> => {
  try {
    const response = await apiGet(`/profiles/${publicId}`, { visitorIp: await visitorIp() });
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'unavailable' };
    return { status: 'found', profile: profileSchema.parse(await response.json()) };
  } catch {
    return { status: 'unavailable' };
  }
});
