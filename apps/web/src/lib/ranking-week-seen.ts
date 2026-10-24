export const RANKING_WEEK_SEEN_KEY = 'carmine:ranking-semana-vista';

/**
 * A semana atual do Ranking virou desde a última visita? Compara com a que ficou guardada e já
 * guarda a de agora. Na primeira visita (nada guardado) não houve virada para mostrar; sem
 * armazenamento (bloqueado, janela privada) também não, para não repetir o efeito a cada visita.
 */
export function weekTurnedSinceLastVisit(storage: Storage | null, currentWeek: string): boolean {
  try {
    const seen = storage?.getItem(RANKING_WEEK_SEEN_KEY) ?? null;
    storage?.setItem(RANKING_WEEK_SEEN_KEY, currentWeek);
    return seen !== null && seen !== currentWeek;
  } catch {
    return false;
  }
}
