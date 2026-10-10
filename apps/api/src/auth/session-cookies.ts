import { CSRF_COOKIE } from '@carmine/contracts';
import type { FastifyReply } from 'fastify';
import type { Session } from './sessions.js';

/**
 * Cookie da sessão: `__Host-` obriga `Secure`, `Path=/` e nenhum `Domain`, então nem um
 * subdomínio consegue sobrescrevê-lo. O navegador aceita `Secure` em http://localhost.
 */
export const SESSION_COOKIE = '__Host-carmine_session';

/** Cookie do fluxo de login: o `state` que amarra a volta da Steam a este navegador. */
export const LOGIN_STATE_COOKIE = 'carmine_login';
export const LOGIN_STATE_PATH = '/api/auth/steam';

/** Grava a sessão (e o token CSRF legível pelo web) com a validade atual dela. */
export function setSessionCookies(reply: FastifyReply, session: Session): void {
  const maxAge = Math.max(1, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
  reply.setCookie(SESSION_COOKIE, session.id, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge,
  });
  reply.setCookie(CSRF_COOKIE, session.csrfToken, {
    path: '/',
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    maxAge,
  });
}

export function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: true, sameSite: 'lax' });
  reply.clearCookie(CSRF_COOKIE, { path: '/', secure: true, sameSite: 'lax' });
}
