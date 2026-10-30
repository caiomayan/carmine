import type { FriendsPlaying, GameMode, PlayerCard, RankingViewer } from '@carmine/contracts';

const MODE_NAME: Record<GameMode, string> = { retake: 'Retake', deathmatch: 'Deathmatch' };

/** O que o card precisa saber de uma Conta que acabou de entrar (S19). */
export interface PlayerCardFacts {
  mode: GameMode;
  displayName: string;
  /** Plano ativo: até a S20 só existe o VIP. */
  vipActive: boolean;
  /** A posição ou o progresso da Conta no Ranking desta semana neste Modo; nulo se a leitura falhou. */
  viewer: RankingViewer | null;
  /** Os amigos Steam que estão jogando num Servidor Carmine agora; nulo se a Steam não respondeu. */
  friends: FriendsPlaying | null;
}

/** O selo do plano. A S20 troca "VIP" pelo nome do plano (Capo ou Padrinho) neste ponto só. */
export function planLabel(vipActive: boolean): string {
  return vipActive ? 'VIP' : '';
}

function rankLabel(mode: GameMode, viewer: RankingViewer | null): string {
  if (viewer?.entry) return `${viewer.entry.position}º no Ranking de ${MODE_NAME[mode]}`;
  if (viewer?.progress) {
    const { unit, missing } = viewer.progress;
    const noun =
      unit === 'rounds'
        ? missing === 1
          ? 'round'
          : 'rounds'
        : missing === 1
          ? 'minuto'
          : 'minutos';
    return `${missing === 1 ? 'Falta' : 'Faltam'} ${missing} ${noun} para o Ranking`;
  }
  return '';
}

function friendsLabel(friends: FriendsPlaying | null): string {
  const online = friends && friends.status !== 'unavailable' ? friends.friends.length : 0;
  if (online === 0) return '';
  return online === 1 ? '1 amigo online' : `${online} amigos online`;
}

/**
 * Os textos do card, prontos. Linha sem dado vem vazia (o addon a esconde): nunca inventamos número. O
 * Rating só existe a partir da S21; até lá a linha fica vazia.
 */
export function buildPlayerCard(facts: PlayerCardFacts): PlayerCard {
  return {
    name: facts.displayName,
    plan: planLabel(facts.vipActive),
    rank: rankLabel(facts.mode, facts.viewer),
    friends: friendsLabel(facts.friends),
    rating: '',
  };
}
