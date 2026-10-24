import { ViewTransition } from 'react';
import { RankingLive } from '@/components/vida/ranking-live';

/** Ranking do protótipo "vida": pódio e tabela com troca de posição animada (dados de exemplo). */
export default function VidaRanking() {
  return (
    <ViewTransition enter="v-in" exit="v-out" default="none">
      <RankingLive />
    </ViewTransition>
  );
}
