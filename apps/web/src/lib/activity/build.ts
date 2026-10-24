import type { ActivityEvent, RecentActivity } from '@carmine/contracts';
import type { Route } from 'next';
import { serverAnchor, serverLabel } from '../live-servers';
import { rankingHref } from '../ranking';
import type { ActivityItemView, ActivityView } from './view';

/** Quantos acontecimentos a faixa leva: cada um é uma parada do Tab, então não são os 20 da API. */
export const ACTIVITY_SHOWN = 10;

/**
 * Como o catálogo responde ao montador. O catálogo da cs2-lib só roda no servidor do web, então
 * quem monta (a rota e a home) o injeta, e aqui a lógica fica pura e testável.
 */
export type ActivityCatalog = {
  /** O nome completo da skin em PT-BR ("AK-47 | Linhas Vermelhas"); nulo se o catálogo não a conhece. */
  skinName(itemId: number): string | null;
};

const serverHref = (id: string) => `/#${serverAnchor(id)}` as Route;

function toItem(event: ActivityEvent, catalog: ActivityCatalog): ActivityItemView | null {
  const player = {
    name: event.player.displayName,
    avatarUrl: event.player.private ? null : event.player.avatarUrl,
  };
  switch (event.type) {
    case 'joined':
      return {
        kind: 'joined',
        id: event.id,
        at: event.at,
        player,
        server: serverLabel(event.server),
        href: serverHref(event.server.id),
      };
    case 'multi_kill':
      return {
        kind: 'multi_kill',
        id: event.id,
        at: event.at,
        player,
        server: serverLabel(event.server),
        kills: event.kills,
        href: serverHref(event.server.id),
      };
    case 'new_leader':
      return {
        kind: 'new_leader',
        id: event.id,
        at: event.at,
        player,
        mode: event.mode,
        href: rankingHref(event.mode) as Route,
      };
    case 'skin_equipped': {
      const skin = catalog.skinName(event.itemId);
      // Quem equipou sem Perfil público não chega aqui (a API o esconde); sem skin conhecida, o
      // acontecimento não diz nada, então fica de fora.
      if (skin === null || event.player.publicId === null) return null;
      return {
        kind: 'skin_equipped',
        id: event.id,
        at: event.at,
        player,
        skin,
        href: `/${event.player.publicId}` as Route,
      };
    }
  }
}

/** A resposta da API como a faixa a desenha: do mais novo para o mais antigo, até {@link ACTIVITY_SHOWN}. */
export function buildActivityView(
  activity: RecentActivity,
  catalog: ActivityCatalog,
): ActivityView {
  const items: ActivityItemView[] = [];
  for (const event of activity.events) {
    const item = toItem(event, catalog);
    if (item) items.push(item);
    if (items.length === ACTIVITY_SHOWN) break;
  }
  return { items };
}
