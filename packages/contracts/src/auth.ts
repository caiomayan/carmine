/**
 * Contratos do login Steam e da sessão do site (S03). O web fala com a API na mesma origem
 * (ADR 0015), então os cookies são first-party.
 */

/** Cabeçalho que toda mutação com sessão precisa trazer, com o token da sessão (CSRF). */
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Cookie legível pelo JavaScript do web com o token CSRF da sessão; o web o copia para o
 * cabeçalho {@link CSRF_HEADER}. Também vem em `GET /api/me` (`csrfToken`).
 */
export const CSRF_COOKIE = 'carmine_csrf';

/** Para onde o login volta quando não há página de origem válida. */
export const DEFAULT_RETURN_PATH = '/';

/**
 * Página do web para onde o login volta quando falha, com o motivo em `?erro=`:
 * `cancelado` (a pessoa desistiu na Steam), `invalido` (asserção recusada ou fluxo expirado),
 * `indisponivel` (a Steam ou a nossa infraestrutura falhou) e `limite` (tentativas demais em pouco
 * tempo: o rate limit do login redireciona em vez de responder 429, porque é navegação).
 */
export const LOGIN_ERROR_PATH = '/entrar';

export type LoginError = 'cancelado' | 'invalido' | 'indisponivel' | 'limite';

const MAX_RETURN_PATH_LENGTH = 512;

/**
 * A página de origem para onde o login volta, só se for um caminho interno do web; qualquer
 * outra coisa vira a home (sem open redirect). Recusa URLs absolutas, `//host`, barras
 * invertidas (que o navegador lê como `/`), segmentos `.` e `..` (que o navegador normaliza,
 * e `/..//host` vira `//host`), versões codificadas de tudo isso, caracteres de controle e
 * rotas da API. O caminho aceito volta como veio, sem normalização.
 */
export function safeReturnPath(input: string | undefined | null): string {
  if (
    typeof input !== 'string' ||
    input.length > MAX_RETURN_PATH_LENGTH ||
    !input.startsWith('/') ||
    hasUnsafeSequence(input)
  ) {
    return DEFAULT_RETURN_PATH;
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    return DEFAULT_RETURN_PATH;
  }
  const path = decoded.split(/[?#]/, 1)[0] ?? '';
  if (hasUnsafeSequence(decoded) || /^\/api(\/|$)/i.test(path)) {
    return DEFAULT_RETURN_PATH;
  }
  return input;
}

function hasUnsafeSequence(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0] ?? '';
  return (
    value.startsWith('//') ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: é exatamente o que recusamos.
    /[\\\u0000-\u001f\u007f]/.test(value) ||
    path.split('/').some((segment) => segment === '.' || segment === '..')
  );
}
