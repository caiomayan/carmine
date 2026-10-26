import type { LiveServerList, WeekSummary } from '@carmine/contracts';
import type { Route } from 'next';
import type { ArtPair } from '@/components/vida/map-art';
import type { ActivityView } from '@/lib/activity/view';
import type { Rarity } from '@/lib/catalog/types';
import type { TopByMode } from './top';

/** Uma skin da vitrine "Loadouts da semana", já resolvida no servidor (catálogo e paleta ficam lá). */
export type LoadoutEntry = {
  key: string;
  itemId: number;
  /** Como no catálogo: a arma (ou o nome do Item, nos que não têm skin)... */
  title: string;
  /** ...e o nome da skin, que a tela destaca; nulo nos Itens sem skin. */
  subtitle: string | null;
  image: string;
  rarity: Rarity;
  statTrak: boolean;
  /** Facas e luvas: a folha dourada. */
  foil: boolean;
  wear: number | null;
  sides: ('ct' | 't')[];
  /** As cores vivas da skin (o JSON do catálogo inteiro nunca vai ao navegador). */
  palette: readonly string[] | null;
  player: { name: string; avatarUrl: string | null; href: Route };
};

/** O que `/vitrine/semana` devolve: a vitrine dos Loadouts, buscada só quando a faixa chega perto da tela. */
export type LoadoutsWeek = { entries: LoadoutEntry[] };

/** Tudo o que a Home recebe do servidor na primeira pintura. Nulo é "a API não respondeu", nunca zero. */
export type HomeData = {
  /** A sessão como o servidor a viu; o navegador confirma (`useFriendsPlaying`). */
  signedIn: boolean;
  /** A Conta logada tem Itens no Loadout (decide "Ver" ou "Montar o meu Loadout"). */
  hasLoadout: boolean;
  servers: LiveServerList | null;
  /** A arte do dia de cada mapa, escolhida no servidor (o `map-art.json` não vai ao JS). */
  art: Record<string, ArtPair>;
  activity: ActivityView | null;
  top: TopByMode | null;
  week: WeekSummary | null;
  /** As cores da skin em destaque da pessoa logada (a cor ambiente da Home); nulo sem skin ou deslogado. */
  ambient: readonly string[] | null;
  /**
   * Há alguém no Ranking com Perfil público: sinal de que a vitrine "Loadouts da semana" tem conteúdo. Sem ele a
   * seção nasce depois do dado, sem esqueleto e sem espaço reservado.
   */
  loadoutsHint: boolean;
};
