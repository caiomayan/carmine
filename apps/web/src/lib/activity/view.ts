import type { GameMode } from '@carmine/contracts';
import type { Route } from 'next';

/**
 * O que a faixa de atividade da home (Marquee) mostra, já pronto para desenhar: nomes de skin
 * resolvidos pelo catálogo, o destino de cada acontecimento montado e nenhum SteamID. É o que a
 * rota `/atividade/recentes` do web devolve ao navegador (a API só manda ids; o catálogo da
 * cs2-lib só roda no servidor do web).
 */

/** Quem aparece: o nome (para o Perfil privado, o "Jogador privado" da API) e nada mais. */
export type ActivityPlayerView = { name: string };

type Base = {
  /** Único por acontecimento: serve de chave. */
  id: string;
  player: ActivityPlayerView;
  /** O contexto do acontecimento: o servidor, o Ranking do Modo ou o Perfil de quem equipou. */
  href: Route;
};

export type ActivityItemView =
  | (Base & { kind: 'joined'; server: string })
  | (Base & { kind: 'multi_kill'; server: string; kills: number })
  | (Base & { kind: 'new_leader'; mode: GameMode })
  | (Base & { kind: 'skin_equipped'; skin: string });

export type ActivityView = { items: ActivityItemView[] };
