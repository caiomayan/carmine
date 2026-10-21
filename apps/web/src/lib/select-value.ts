/** Valor interno do item "vazio" do SimpleSelect: o Radix não aceita `value=""` num item. */
export const EMPTY_SELECT_VALUE = '__empty__';

/**
 * O valor que o `SimpleSelect` repassa a quem o usa, a partir do que o Radix avisou: o item
 * "vazio" vira `''` (desfazer a escolha) e `null` é um aviso a ignorar. O Radix também avisa
 * com `''` quando o valor controlado muda para uma opção que ainda não montou; como nenhum
 * item tem `''` de valor, esse `''` nunca é uma escolha de quem usa a tela.
 */
export function chosenSelectValue(next: string): string | null {
  if (next === EMPTY_SELECT_VALUE) return '';
  return next === '' ? null : next;
}
