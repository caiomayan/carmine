import type { ProfileStats, TotalStats } from '@carmine/contracts';

/**
 * Em que pé estão as Estatísticas de um Perfil: a API não respondeu, o Perfil é privado para
 * quem vê, a Conta ainda não jogou ou há números para mostrar.
 */
export type StatsState = 'unavailable' | 'private' | 'empty' | 'ready';

export function statsState(stats: ProfileStats | null): StatsState {
  if (stats === null) return 'unavailable';
  if (!stats.visible) return 'private';
  if (stats.total === null || stats.modes.length === 0) return 'empty';
  return 'ready';
}

/** Os três números de destaque do Perfil, na ordem em que aparecem. */
export const HIGHLIGHT_KEYS = ['kd', 'kills', 'headshotPercent'] as const;
export type HighlightKey = (typeof HIGHLIGHT_KEYS)[number];

export function highlightsOf(total: TotalStats): { key: HighlightKey; value: number | null }[] {
  return HIGHLIGHT_KEYS.map((key) => ({ key, value: total[key] }));
}
