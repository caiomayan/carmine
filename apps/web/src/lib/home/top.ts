import type { GameMode, Ranking } from '@carmine/contracts';
import type { Route } from 'next';

/** Uma linha do "Top 3 da semana" da Home, já pronta para desenhar. */
export type TopRow = {
  position: number;
  /** O nome; no Perfil privado, o "Jogador privado" do Ranking, sem link nem avatar. */
  name: string;
  private: boolean;
  href: Route | null;
  avatarUrl: string | null;
  /** Retake: rounds vencidos; Deathmatch: abates por minuto. */
  value: number;
  decimals: 0 | 2;
};

/**
 * As primeiras linhas do Ranking da semana de um Modo, como o Ranking as mostra: o mesmo critério, a mesma
 * identidade (`rankingIdentity`). Sem linhas (ninguém cumpriu o mínimo ainda), nada: a Home mostra o estado vazio.
 */
export function topRows(ranking: Pick<Ranking, 'mode' | 'entries'>, limit = 3): TopRow[] {
  const decimals = ranking.mode === 'deathmatch' ? 2 : 0;
  return ranking.entries.slice(0, limit).map((entry) => ({
    position: entry.position,
    name: entry.player.displayName,
    private: entry.player.private,
    href:
      !entry.player.private && entry.player.publicId !== null
        ? (`/${entry.player.publicId}` as Route)
        : null,
    avatarUrl: entry.player.private ? null : entry.player.avatarUrl,
    value: entry.score,
    decimals,
  }));
}

export type TopByMode = Record<GameMode, TopRow[]>;
