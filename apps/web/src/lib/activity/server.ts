import { getRecentActivity } from '../api-server';
import { buildActivityView } from './build';
import type { ActivityView } from './view';

/**
 * A faixa de atividade como a home a desenha, com os nomes das skins do catálogo da cs2-lib (só
 * no servidor do web, nunca no navegador). Sem a API é `null`: a home fica sem a faixa em vez de
 * mostrar um erro. O catálogo é pesado, então só entra quando há uma skin equipada para nomear.
 */
export async function getActivityView(): Promise<ActivityView | null> {
  const activity = await getRecentActivity();
  if (!activity) return null;
  const lookup = activity.events.some((event) => event.type === 'skin_equipped')
    ? (await import('../catalog/catalog')).catalogEntry
    : () => undefined;
  return buildActivityView(activity, { skinName: (itemId) => lookup(itemId)?.name ?? null });
}
