import type { GameMode } from '@carmine/contracts';
import type { Route } from 'next';
import { artTable } from '@/components/vida/map-art';
import { getActivityView } from '@/lib/activity/server';
import {
  getLiveServers,
  getProfile,
  getRanking,
  getServerSession,
  getWeekSummary,
} from '@/lib/api-server';
import { skinPalette } from '@/lib/skin-palette';
import {
  hasLoadoutCandidates,
  type ItemLookup,
  LOADOUT_CANDIDATES,
  pickHighlight,
  sidesOf,
} from './loadouts';
import { type TopByMode, topRows } from './top';
import type { HomeData, LoadoutEntry } from './types';

/**
 * O catálogo da cs2-lib como a Home o usa (raridade e tipo de cada Item): só no servidor do site, e só carregado
 * quando há um Item para consultar (é pesado).
 */
async function catalogLookup(): Promise<{
  lookup: ItemLookup;
  entry: (id: number) => ReturnType<typeof import('@/lib/catalog/catalog').catalogEntry>;
}> {
  const { catalogEntry } = await import('@/lib/catalog/catalog');
  return {
    lookup: (id) => {
      const entry = catalogEntry(id);
      return entry ? { rarity: entry.rarity, type: entry.type } : null;
    },
    entry: catalogEntry,
  };
}

/** O Ranking da semana de um Modo, só as linhas; nulo quando a API não respondeu. */
async function rankingOf(mode: GameMode) {
  const result = await getRanking(mode, undefined);
  return result.status === 'ok' ? result.ranking : null;
}

/**
 * Tudo o que a Home precisa na primeira pintura, lido em paralelo. Cada fonte que falha vira nulo (a Home mostra o
 * estado dela, nunca um zero inventado); a Home sem servidores é a única que vira a tela "indisponível".
 */
export async function getHomeData(): Promise<HomeData> {
  const [session, servers, activity, retake, deathmatch, week] = await Promise.all([
    getServerSession(),
    getLiveServers(),
    getActivityView(),
    rankingOf('retake'),
    rankingOf('deathmatch'),
    getWeekSummary(),
  ]);

  const top: TopByMode | null =
    retake || deathmatch
      ? {
          retake: retake ? topRows(retake) : [],
          deathmatch: deathmatch ? topRows(deathmatch) : [],
        }
      : null;

  // A cor ambiente é a da skin em destaque de quem está logado (o Loadout da própria Conta).
  let ambient: readonly string[] | null = null;
  if (session.status === 'authenticated') {
    const items = session.session.account.loadoutShowcase.items;
    if (items.length > 0) {
      const { lookup } = await catalogLookup();
      const highlight = pickHighlight(items, lookup);
      ambient = highlight ? skinPalette(highlight.item.id) : null;
    }
  }

  return {
    signedIn: session.status === 'authenticated',
    hasLoadout:
      session.status === 'authenticated' &&
      session.session.account.loadoutShowcase.items.length > 0,
    servers,
    art: artTable(),
    activity,
    top,
    week,
    ambient,
    loadoutsHint: hasLoadoutCandidates([retake, deathmatch]),
  };
}

/** Quantas skins a vitrine tem no máximo. */
const LOADOUT_MAX = 8;

/**
 * A vitrine "Loadouts da semana": um Item em destaque do Loadout de cada um dos melhores da semana (Retake e
 * Deathmatch), só de Perfil público (o privado é "Jogador privado" no Ranking e fica de fora). Sem ninguém, vazio:
 * a seção some.
 */
export async function getLoadoutsWeek(): Promise<LoadoutEntry[]> {
  const rankings = await Promise.all([rankingOf('retake'), rankingOf('deathmatch')]);
  // Intercala os dois Modos (o 1º de cada, o 2º de cada...) para a vitrine não ser toda de um Modo só.
  const seen = new Set<number>();
  const candidates: { publicId: number }[] = [];
  for (let i = 0; i < LOADOUT_CANDIDATES; i++) {
    for (const ranking of rankings) {
      const player = ranking?.entries[i]?.player;
      if (!player || player.private || player.publicId === null) continue;
      if (seen.has(player.publicId)) continue;
      seen.add(player.publicId);
      candidates.push({ publicId: player.publicId });
    }
  }
  if (candidates.length === 0) return [];

  const profiles = await Promise.all(candidates.map(({ publicId }) => getProfile(publicId)));
  const { lookup, entry } = await catalogLookup();
  const entries: LoadoutEntry[] = [];
  for (const result of profiles) {
    if (result.status !== 'found' || result.profile.isPrivate) continue;
    const { profile } = result;
    const highlight = pickHighlight(profile.loadoutShowcase.items, lookup);
    const catalogItem = highlight ? entry(highlight.item.id) : undefined;
    if (!highlight || !catalogItem) continue;
    entries.push({
      key: `${profile.publicId}-${highlight.item.id}`,
      itemId: highlight.item.id,
      // Como no catálogo: o título é a arma e o subtítulo é o nome da skin (a tela destaca o subtítulo).
      title: catalogItem.title,
      subtitle: catalogItem.subtitle,
      image: catalogItem.image,
      rarity: catalogItem.rarity,
      statTrak: highlight.item.statTrak !== undefined,
      foil: catalogItem.type === 'knife' || catalogItem.type === 'glove',
      wear: highlight.item.wear ?? null,
      sides: sidesOf(highlight, profile.loadoutShowcase.items),
      palette: skinPalette(highlight.item.id),
      player: {
        name: profile.displayName,
        avatarUrl: profile.avatarUrl,
        href: `/${profile.publicId}` as Route,
      },
    });
    if (entries.length === LOADOUT_MAX) break;
  }
  return entries;
}
