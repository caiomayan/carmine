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

/**
 * Qual texto diz onde algo está equipado: `ct`, `t` ou `both` (os dois lados, ou um slot sem
 * lado). A chave é a de `sidesShort.*` e `common.team.equippedIn.*` nas mensagens.
 */
export function sidesLabelKey(sides: readonly (LoadoutSide | null)[]): LoadoutSide | 'both' {
  const shown = equippedTeamSides(sides);
  return shown.length === 1 ? (shown[0] as LoadoutSide) : 'both';
}
