import type { HeaderPreviews, LiveServer, LoadoutSide, RankingEntry } from '@carmine/contracts';
import type { Route } from 'next';
import { serverHref, serverLabel } from '../live-servers';
import type {
  HeaderView,
  InventoryView,
  LoadoutSlotView,
  LoadoutView,
  PlayView,
  PreviewItem,
  PreviewServer,
  RankingModeView,
  RankingRowView,
  RankingView,
} from './view';

/**
 * Como o catálogo responde ao montador. O catálogo da cs2-lib só roda no servidor do web, então
 * quem monta (a rota) o injeta, e aqui a lógica fica pura e testável.
 */
export type CatalogLookup = {
  /** O Item do catálogo; nulo se o catálogo não o conhece. `skinFirst`: armas, facas e luvas. */
  item(itemId: number): {
    title: string;
    subtitle: string | null;
    image: string;
    skinFirst: boolean;
  } | null;
  /** O que o jogador usa num slot vazio: o nome e a imagem da Arma padrão. */
  slotDefault(slot: string, side: LoadoutSide): { name: string | null; image: string | null };
};

/** A skin em destaque e a arma como apoio (nos agentes e music kits, o nome já é o destaque). */
function names(item: { title: string; subtitle: string | null; skinFirst: boolean }) {
  return item.skinFirst && item.subtitle
    ? { title: item.subtitle, caption: item.title }
    : { title: item.title, caption: item.subtitle };
}

const toServer = (server: LiveServer): PreviewServer => ({
  id: server.id,
  href: serverHref(server) as Route,
  name: serverLabel(server),
  mode: server.mode,
  map: server.map,
  players: server.players,
  maxPlayers: server.maxPlayers,
  state: server.state,
  address: server.address,
});

function buildPlay(play: HeaderPreviews['play']): PlayView {
  const { recommended } = play;
  return {
    recommended: recommended && {
      ...toServer(recommended.server),
      reason: recommended.reason,
      // O SteamID não passa daqui: o painel só precisa do nome, da foto e do Perfil.
      friends: recommended.friends.map((friend) => ({
        key: String(friend.publicId),
        name: friend.displayName,
        avatarUrl: friend.avatarUrl,
        href: `/${friend.publicId}` as Route,
      })),
    },
    others: play.others.map(toServer),
    friendsPlaying: play.friendsPlaying,
  };
}

function buildLoadout(
  loadout: NonNullable<HeaderPreviews['loadout']>,
  lookup: CatalogLookup,
): LoadoutView {
  const slots = loadout.slots.map((slot): LoadoutSlotView => {
    const item = slot.itemId !== null && slot.uid !== null ? lookup.item(slot.itemId) : null;
    if (item && slot.uid) {
      return {
        slot: slot.slot,
        equipped: true,
        ...names(item),
        image: item.image,
        href: `/inventario/${slot.uid}` as Route,
        statTrak: slot.statTrak,
      };
    }
    const fallback = lookup.slotDefault(slot.slot, loadout.side);
    return {
      slot: slot.slot,
      equipped: false,
      title: fallback.name,
      caption: null,
      image: fallback.image,
      href: '/loadout' as Route,
      statTrak: false,
    };
  });
  return { side: loadout.side, presetName: loadout.presetName, slots };
}

function buildInventory(
  inventory: NonNullable<HeaderPreviews['inventory']>,
  lookup: CatalogLookup,
): InventoryView {
  const latest = inventory.latest.flatMap((entry): PreviewItem[] => {
    const item = lookup.item(entry.itemId);
    if (!item) return [];
    return [
      {
        key: entry.uid,
        ...names(item),
        image: item.image,
        href: `/inventario/${entry.uid}` as Route,
        statTrak: entry.statTrak,
      },
    ];
  });
  return { total: inventory.total, limit: inventory.limit, latest };
}

function toRow(entry: RankingEntry): RankingRowView {
  const { player } = entry;
  return {
    position: entry.position,
    name: player.displayName,
    avatarUrl: player.private ? null : player.avatarUrl,
    // O Perfil privado continua anônimo: nada leva à Conta.
    href: !player.private && player.publicId !== null ? (`/${player.publicId}` as Route) : null,
    self: entry.self,
  };
}

function buildRanking(ranking: NonNullable<HeaderPreviews['ranking']>): RankingView {
  return {
    closesAt: ranking.closesAt,
    modes: ranking.modes.map((entry): RankingModeView => {
      const href = `/ranking?modo=${entry.mode}` as Route;
      return {
        mode: entry.mode,
        href,
        top: entry.top.map(toRow),
        mine: entry.mine && {
          position: entry.mine.position,
          progress: entry.mine.progress,
          href: entry.mine.position === null ? href : (`${href}#minha-linha` as Route),
        },
      };
    }),
  };
}

/** Os Itens do Loadout de exemplo do visitante: Karambit, AK-47 Linhas Vermelhas e AWP Asiimov. */
const EXAMPLE_SLOTS: { slot: string; itemId: number | null }[] = [
  { slot: 'knife', itemId: 41 },
  { slot: 'gloves', itemId: null },
  { slot: 'weapon_ak47', itemId: 222 },
  { slot: 'weapon_awp', itemId: 306 },
];

function buildExample(lookup: CatalogLookup): LoadoutView {
  const side: LoadoutSide = 't';
  const slots = EXAMPLE_SLOTS.map(({ slot, itemId }): LoadoutSlotView => {
    const item = itemId === null ? null : lookup.item(itemId);
    if (item) {
      return {
        slot,
        equipped: true,
        ...names(item),
        image: item.image,
        href: '/loadout' as Route,
        statTrak: false,
      };
    }
    const fallback = lookup.slotDefault(slot, side);
    return {
      slot,
      equipped: false,
      title: fallback.name,
      caption: null,
      image: fallback.image,
      href: '/loadout' as Route,
      statTrak: false,
    };
  });
  return { side, presetName: '', slots };
}

/**
 * As prévias da API (só ids e dados de domínio) viram o que os painéis desenham: nomes e imagens
 * do catálogo, destinos e nenhum SteamID. Cada seção é independente: a que a API mandou nula
 * (sem sessão ou que falhou) continua nula.
 */
export function buildHeaderView(previews: HeaderPreviews, lookup: CatalogLookup): HeaderView {
  return {
    signedIn: previews.signedIn,
    play: buildPlay(previews.play),
    loadout: previews.loadout && buildLoadout(previews.loadout, lookup),
    example: previews.signedIn ? null : buildExample(lookup),
    inventory: previews.inventory && buildInventory(previews.inventory, lookup),
    ranking: previews.ranking && buildRanking(previews.ranking),
  };
}
