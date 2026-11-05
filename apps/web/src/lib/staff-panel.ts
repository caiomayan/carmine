/**
 * O painel da Staff é outra aplicação (S25, `apps/staff`, outro host). O `/staff` do site só redireciona para ele,
 * para os links e favoritos antigos continuarem valendo. Sem dependências de propósito: roda no proxy.
 */

/** A origem do painel, de `PUBLIC_STAFF_URL` (a mesma variável da API); vazia ou inválida: o painel não está ligado. */
export function staffPanelOrigin(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  if (value === '') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Para onde vai um caminho do `/staff` antigo, ou `null` se ele não é da Staff (ou o painel não está ligado).
 * O `/staff` puro (o atalho do menu) vai para o Início do painel; com busca (`/staff?q=`, que era a tela de Contas),
 * para `/contas`. O resto mantém o caminho (`/staff/auditoria` → `/auditoria`, `/staff/contas/10016` →
 * `/contas/10016`), e a consulta (`?q=`, `?alvo=`) segue junto.
 */
export function staffPanelRedirect(pathname: string, search: string, origin: string | null) {
  if (origin === null) return null;
  const match = /^\/staff(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const rest = (match[1] ?? '').replace(/\/+$/, '');
  const path = rest !== '' ? rest : search === '' ? '/' : '/contas';
  return `${origin}${path}${search}`;
}
