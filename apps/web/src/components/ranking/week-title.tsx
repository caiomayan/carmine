'use client';

import { EncryptedText } from '@/components/ui/encrypted-text';
import { weekTurnedSinceLastVisit } from '@/lib/ranking-week-seen';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * O título da semana do Ranking. Decifra quando a pessoa troca de semana no seletor (o componente
 * continua montado e o texto muda) e na primeira visita depois que a semana atual virou (a última
 * semana vista fica no navegador). Nas demais visitas vem parado.
 */
export function WeekTitle({ text, currentWeek }: { text: string; currentWeek: string }) {
  return (
    <h2 className="text-lg font-semibold" data-testid="week-title">
      <EncryptedText
        text={text}
        onChange
        onMount={() => weekTurnedSinceLastVisit(storage(), currentWeek)}
      />
    </h2>
  );
}
