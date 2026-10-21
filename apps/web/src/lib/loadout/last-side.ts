import type { LoadoutSide } from '@carmine/contracts';

export const LAST_SIDE_KEY = 'carmine:loadout-side';

const FIRST_SIDE: LoadoutSide = 'ct';

/** O lado em que o Loadout abre: o último que a pessoa usou, ou CT se não há nada guardado. */
export function readLastSide(storage: Storage | null): LoadoutSide {
  try {
    const raw = storage?.getItem(LAST_SIDE_KEY);
    return raw === 't' || raw === 'ct' ? raw : FIRST_SIDE;
  } catch {
    return FIRST_SIDE;
  }
}

/** Guarda o lado; sem armazenamento (bloqueado, janela privada) a tela só abre no CT da próxima vez. */
export function writeLastSide(storage: Storage | null, side: LoadoutSide): void {
  try {
    storage?.setItem(LAST_SIDE_KEY, side);
  } catch {
    // Sem onde guardar: a escolha vale só nesta visita.
  }
}
