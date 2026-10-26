import type { GameMode, LiveServer } from '@carmine/contracts';
import type { ArtPair } from '@/components/vida/map-art';
import { mapSlug } from '@/lib/map-art';

/**
 * A arte de reserva de um servidor parado que não tem mapa conhecido (nunca mandou batimento, ou o último foi um
 * mapa fora da rotação): um mapa por Modo, só estético. O cartão não escreve esse mapa (o nome grande só aparece
 * quando o mapa é real) e pinta a arte mais apagada.
 */
export const SLEEP_ART_MAP: Record<GameMode, string> = { retake: 'mirage', deathmatch: 'dust2' };

export type SleepingArt = {
  /** A chave da arte em `public/maps` (e na tabela de artes). */
  slug: string;
  art: ArtPair;
  /** Verdadeiro quando a arte é a de reserva do Modo, e não a do último mapa do servidor. */
  placeholder: boolean;
};

/** A arte do cartão de um servidor offline: a do último mapa conhecido; senão a do Modo; sem nenhuma, nulo. */
export function sleepingArt(
  server: Pick<LiveServer, 'lastMap' | 'mode'>,
  table: Readonly<Record<string, ArtPair>>,
): SleepingArt | null {
  const last = mapSlug(server.lastMap);
  const lastArt = last ? table[last] : undefined;
  if (last && lastArt) return { slug: last, art: lastArt, placeholder: false };
  const fallback = SLEEP_ART_MAP[server.mode];
  const fallbackArt = table[fallback];
  return fallbackArt ? { slug: fallback, art: fallbackArt, placeholder: true } : null;
}
