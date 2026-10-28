/**
 * Quais caminhos entram na contagem de páginas. Sem dependências de propósito: a contagem decide isto na primeira carga
 * (antes de baixar o resto), então este arquivo precisa ser mínimo.
 */

/** Fora do site público: a Staff, a vitrine interna, a checagem de saúde e a própria API. Nunca contam. */
const NOT_COUNTED = new Set(['staff', 'dev', 'healthz', 'api']);

/** O caminho conta como página vista? (`/staff`, `/dev`, `/healthz` e `/api` e o que vem abaixo deles, não.) */
export function isCountedPath(pathname: string): boolean {
  const first = pathname.split('/', 2)[1] ?? '';
  return !NOT_COUNTED.has(first.toLowerCase());
}
