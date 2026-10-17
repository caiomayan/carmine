import {
  DEFAULT_RETURN_PATH,
  LOGIN_ERROR_PATH,
  type LoginError,
  safeReturnPath,
} from '@carmine/contracts/auth';
import { isSteamId64 } from '@carmine/contracts/rules';

/** Página do web que oferece o login Steam (e recebe os erros dele em `?erro=`). */
export const SIGN_IN_PATH = LOGIN_ERROR_PATH;

/** Por que a pessoa foi mandada para entrar, além de ter clicado em "Entrar". */
export type SignInReason = 'sessao-expirada';

const LOGIN_ERRORS: readonly LoginError[] = ['cancelado', 'invalido', 'indisponivel', 'limite'];

/** O caminho interno para onde voltar depois do login; nunca a própria página de entrar. */
function returnPath(input: string | null | undefined): string {
  const path = safeReturnPath(input);
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === SIGN_IN_PATH ? DEFAULT_RETURN_PATH : path;
}

/** Começa o login Steam na API (navegação, não fetch), voltando à página de origem. */
export function steamLoginHref(returnTo: string | null | undefined): string {
  return `/api/auth/steam/login?${new URLSearchParams({ returnTo: returnPath(returnTo) })}`;
}

/** A página de entrar, lembrando de onde a pessoa veio. */
export function signInHref(from: string, reason?: SignInReason): string {
  const params = new URLSearchParams();
  const back = returnPath(from);
  if (back !== DEFAULT_RETURN_PATH) params.set('voltar', back);
  if (reason) params.set('motivo', reason);
  const query = params.toString();
  return query ? `${SIGN_IN_PATH}?${query}` : SIGN_IN_PATH;
}

/** O motivo de falha que a API mandou em `?erro=`; qualquer outro valor é ignorado. */
export function parseLoginError(value: string | string[] | undefined): LoginError | null {
  const first = Array.isArray(value) ? value[0] : value;
  return LOGIN_ERRORS.find((error) => error === first) ?? null;
}

/** O proxy marca com isto as requisições de caminhos numéricos: são endereços de Perfil. */
export const PROFILE_PATH_HEADER = 'x-carmine-profile-path';

export type ProfileSegment =
  | { kind: 'publicId'; publicId: number }
  | { kind: 'steamId'; steamId: string }
  | { kind: 'invalid' };

/** ID público: só dígitos, sem zero à esquerda; até 15 dígitos (cabe num `number`). */
const PUBLIC_ID = /^[1-9]\d{0,14}$/;

/**
 * O que vem em `stcarmine.com/<segmento>`: um ID público (o Perfil) ou um SteamID64 (que
 * redireciona para o Perfil). Os 17 dígitos de um SteamID64 nunca são um ID público.
 */
export function parseProfileSegment(segment: string): ProfileSegment {
  if (isSteamId64(segment)) return { kind: 'steamId', steamId: segment };
  if (PUBLIC_ID.test(segment)) return { kind: 'publicId', publicId: Number(segment) };
  return { kind: 'invalid' };
}
