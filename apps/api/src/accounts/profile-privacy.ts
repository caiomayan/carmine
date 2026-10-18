/** Como o Ranking chama quem tem o Perfil privado (S11). */
export const PRIVATE_PLAYER_NAME = 'Jogador privado';

/**
 * O ponto único do Perfil privado (S11) que Estatísticas e Ranking (S12) consultam. Nada que
 * mostre Estatísticas de uma Conta decide por conta própria: o Perfil, o Ranking e a prévia do
 * link passam por aqui. Nome, avatar, Loadout e presença em servidor não dependem dele.
 */

/**
 * As Estatísticas da Conta aparecem para quem pede? Perfil privado esconde de todos, menos da
 * própria Conta (`viewerAccountId`), que continua vendo as suas.
 */
export function canSeeStats(
  account: { id: string; profilePrivate: boolean },
  viewerAccountId: string | null,
): boolean {
  return !account.profilePrivate || account.id === viewerAccountId;
}

export type RankingIdentity =
  | { private: false; publicId: number; displayName: string; avatarUrl: string | null }
  | { private: true; displayName: typeof PRIVATE_PLAYER_NAME };

/**
 * Quem aparece numa linha do Ranking. O Perfil privado vira "Jogador privado" para todos (o
 * Ranking é o mesmo para qualquer visitante, e nada na linha leva à Conta: sem ID, nome nem
 * avatar).
 */
export function rankingIdentity(account: {
  publicId: number;
  displayName: string;
  avatarUrl: string | null;
  profilePrivate: boolean;
}): RankingIdentity {
  if (account.profilePrivate) return { private: true, displayName: PRIVATE_PLAYER_NAME };
  return {
    private: false,
    publicId: account.publicId,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl,
  };
}
