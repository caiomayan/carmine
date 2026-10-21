import type { LoadoutSide } from '@carmine/contracts';

/** Ordem fixa dos lados em todo o site: TR à esquerda, CT à direita. */
const ORDER: readonly LoadoutSide[] = ['t', 'ct'];

/** Os lados que aparecem, na ordem fixa e sem repetição. */
export function orderedSides(sides: readonly LoadoutSide[]): LoadoutSide[] {
  return ORDER.filter((side) => sides.includes(side));
}
