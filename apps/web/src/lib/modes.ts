/** Modos dos Servidores Carmine no MVP (o 5v5 casual vem depois). */
export const MODES = ['retake', 'deathmatch'] as const;
export type Mode = (typeof MODES)[number];
