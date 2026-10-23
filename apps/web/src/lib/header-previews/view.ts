import type {
  GameMode,
  LiveServerState,
  LoadoutSide,
  RecommendationReason,
} from '@carmine/contracts';
import type { Route } from 'next';

/**
 * O que os painéis do header (U3e) mostram, já pronto para desenhar: nomes e imagens resolvidos
 * pelo catálogo, destinos montados e nenhum SteamID. É o que a rota `/header/previews` do web
 * devolve ao navegador (a API só manda ids; o catálogo da cs2-lib só roda no servidor do web).
 */

export type PreviewServer = {
  id: string;
  /** O cartão dele na home. */
  href: Route;
  name: string;
  mode: GameMode;
  map: string | null;
  players: number;
  maxPlayers: number;
  state: LiveServerState;
  /** `host:porta`, para o Jogar (steam://connect) e o "copiar IP". */
  address: string;
};

export type PreviewFriend = { key: string; name: string; avatarUrl: string | null; href: Route };

export type PlayView = {
  recommended: null | (PreviewServer & { reason: RecommendationReason; friends: PreviewFriend[] });
  others: PreviewServer[];
  /** Amigos jogando agora em qualquer servidor; nulo sem sessão ou com a Steam fora. */
  friendsPlaying: number | null;
};

/** Um Item para mostrar: a skin em destaque (`title`) e a arma como apoio (`caption`). */
export type PreviewItem = {
  key: string;
  title: string;
  caption: string | null;
  image: string;
  href: Route;
  statTrak: boolean;
};

export type LoadoutSlotView = {
  slot: string;
  equipped: boolean;
  /** Item equipado: a skin; slot vazio: o nome da arma padrão (ou nulo). */
  title: string | null;
  caption: string | null;
  image: string | null;
  href: Route;
  statTrak: boolean;
};

export type LoadoutView = { side: LoadoutSide; presetName: string; slots: LoadoutSlotView[] };

export type InventoryView = { total: number; limit: number; latest: PreviewItem[] };

export type RankingRowView = {
  position: number;
  name: string;
  avatarUrl: string | null;
  /** O Perfil; nulo no Perfil privado, que continua anônimo como no Ranking. */
  href: Route | null;
  self: boolean;
};

export type RankingModeView = {
  mode: GameMode;
  href: Route;
  top: RankingRowView[];
  mine: null | {
    position: number | null;
    progress: { unit: 'rounds' | 'minutes'; missing: number } | null;
    /** O Ranking do Modo, com a minha linha em foco quando tenho posição. */
    href: Route;
  };
};

export type RankingView = { closesAt: string; modes: RankingModeView[] };

export type HeaderView = {
  signedIn: boolean;
  play: PlayView;
  loadout: LoadoutView | null;
  /** Sem sessão: um Loadout de exemplo (Itens do catálogo) para o convite "Monte o seu". */
  example: LoadoutView | null;
  inventory: InventoryView | null;
  ranking: RankingView | null;
};
