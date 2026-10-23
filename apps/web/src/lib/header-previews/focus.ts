/**
 * Se a navegação rica, ao entrar no lugar da leve, deve devolver o foco ao item que o tinha. A troca
 * desmonta o item antigo e o foco cai no <body>; se o módulo demorou e a pessoa já levou o foco a outro
 * lugar, ele fica onde ela o pôs (só devolve com o foco no <body> ou já no próprio item).
 */
export function shouldRestoreFocus(
  active: Element | null,
  body: Element,
  item: Element | null,
): boolean {
  return item !== null && (active === null || active === body || active === item);
}
