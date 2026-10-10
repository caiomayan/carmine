/** Um item da navegação está ativo na própria rota e nas filhas; a home, só na raiz. */
export function isCurrentPath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
