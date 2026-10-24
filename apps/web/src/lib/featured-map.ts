import { mapArt } from './map-art';

/** O mapa em destaque quando nenhum servidor está jogando (ou a API está fora). */
export const DEFAULT_FEATURED_MAP = 'mirage';

interface FeaturedCandidate {
  map: string | null;
  state: string;
  players: number;
}

/**
 * O mapa em destaque do site (a arte dentro das letras do rodapé e as cores do fundo do Ranking): o
 * do servidor com mais gente jogando agora. Servidor offline, sem mapa ou sem arte não conta; em
 * empate vale o primeiro da lista (que já vem ordenada por Modo e nome). Sem nenhum, o padrão.
 */
export function featuredMap(servers: readonly FeaturedCandidate[] | null | undefined): string {
  let best: { slug: string; players: number } | null = null;
  for (const server of servers ?? []) {
    if (server.state === 'offline') continue;
    const art = mapArt(server.map);
    if (art && (!best || server.players > best.players)) {
      best = { slug: art.slug, players: server.players };
    }
  }
  return best?.slug ?? DEFAULT_FEATURED_MAP;
}
