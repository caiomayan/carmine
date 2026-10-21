import type { LoadoutSide } from '@carmine/contracts';

/** Ordem fixa dos lados em todo o site: TR à esquerda, CT à direita. */
const ORDER: readonly LoadoutSide[] = ['t', 'ct'];

/** Os lados que aparecem, na ordem fixa e sem repetição. */
export function orderedSides(sides: readonly LoadoutSide[]): LoadoutSide[] {
  return ORDER.filter((side) => sides.includes(side));
}

/**
 * Os lados em que um Item está equipado, a partir dos slots do Loadout. Um slot sem lado
 * (`null`, o kit de música) vale nos dois.
 */
export function equippedTeamSides(
  slots: readonly (LoadoutSide | null)[] | undefined,
): LoadoutSide[] {
  if (!slots) return [];
  return orderedSides(slots.flatMap((side) => (side === null ? ORDER : [side])));
}
