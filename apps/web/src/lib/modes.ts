/** Modos dos Servidores Carmine no MVP (o 5v5 casual vem depois) e o filtro "todos". */
export const MODES = ['retake', 'deathmatch'] as const;
export type Mode = (typeof MODES)[number];

export const MODE_FILTERS = ['all', ...MODES] as const;
export type ModeFilter = (typeof MODE_FILTERS)[number];
