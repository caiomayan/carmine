/**
 * Posições prontas do chaveiro ao longo da arma, no mesmo modelo dos slots dos stickers: a
 * pessoa escolhe uma posição da lista e refina nos controles de ajuste fino. Arrastar no 3D
 * é só um atalho e vira uma posição "personalizada". O X corre pelo comprimento da arma; Y e Z
 * ficam no meio da faixa que a cs2-lib aceita para o modelo.
 */

export const CHARM_SLOTS = 5;

type Range = { min: number; max: number };
export type CharmBounds = { x: Range; y: Range; z: Range };
export type CharmPosition = { x: number; y: number; z: number };

export type CharmPlacement =
  | { kind: 'default' }
  | { kind: 'slot'; slot: number }
  | { kind: 'custom' };

const POSITION_DECIMALS = 4;
// Os valores guardados já vêm arredondados a 4 casas; a folga é só para o erro de ponto flutuante e
// fica abaixo do passo do ajuste fino (0,0001): o menor toque no controle já sai do slot.
const TOLERANCE = 10 ** -(POSITION_DECIMALS + 1);
const round = (value: number) => Number(value.toFixed(POSITION_DECIMALS));
const middle = (range: Range) => (range.min + range.max) / 2;

/** A posição do slot (0 a {@link CHARM_SLOTS} - 1); um índice fora vira o mais próximo. */
export function charmSlotPosition(bounds: CharmBounds, slot: number): CharmPosition {
  const index = Math.min(Math.max(Math.round(slot), 0), CHARM_SLOTS - 1);
  const along = bounds.x.min + ((bounds.x.max - bounds.x.min) * index) / (CHARM_SLOTS - 1);
  return { x: round(along), y: round(middle(bounds.y)), z: round(middle(bounds.z)) };
}

/**
 * Onde o chaveiro está: no padrão da arma (sem posição guardada), num slot (a posição é a de um
 * deles) ou personalizado (arrastado no 3D ou ajustado nos controles finos).
 */
export function charmPlacement(
  bounds: CharmBounds,
  position: { x?: number; y?: number; z?: number },
): CharmPlacement {
  const { x, y, z } = position;
  if (x === undefined || y === undefined || z === undefined) return { kind: 'default' };
  for (let slot = 0; slot < CHARM_SLOTS; slot++) {
    const at = charmSlotPosition(bounds, slot);
    if (
      Math.abs(x - at.x) <= TOLERANCE &&
      Math.abs(y - at.y) <= TOLERANCE &&
      Math.abs(z - at.z) <= TOLERANCE
    ) {
      return { kind: 'slot', slot };
    }
  }
  return { kind: 'custom' };
}
