'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { InView } from './in-view';
import { LoadoutsSkeleton } from './skeleton';

const LoadoutsWeek = dynamic(() => import('./loadouts-week'), { ssr: false });

/**
 * O lugar da vitrine "Loadouts da semana", no fim da Home. Nasce **fechado** (altura zero, sem esqueleto) e só se
 * abre quando há o que mostrar, com uma transição suave de altura e opacidade; se aparece e a API devolve vazio,
 * fecha do mesmo jeito. Assim a Home nunca reserva um espaço que depois some (o salto de layout de antes).
 *
 * `expectContent` é o sinal do servidor de que a vitrine provavelmente tem conteúdo (há alguém no Ranking com
 * Perfil público): só nesse caso o esqueleto aparece, já aberto, no lugar da vitrine. Sem o sinal a seção ainda
 * busca o dado (barato) e, se ele vier, nasce depois dele.
 */
export function LoadoutsSlot({ expectContent }: { expectContent: boolean }) {
  const [open, setOpen] = useState(expectContent);
  return (
    <div
      data-testid="loadouts-slot"
      data-open={open || undefined}
      // `overflow-y: clip` (não `hidden`): a faixa da vitrine vai de borda a borda e não pode ser cortada na lateral.
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-(--dur-slow) ease-soft motion-reduce:transition-none',
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
      )}
      aria-hidden={open ? undefined : true}
    >
      <div className="min-h-0 [overflow-y:clip]">
        <InView fallback={expectContent ? <LoadoutsSkeleton /> : null}>
          <LoadoutsWeek expectContent={expectContent} onResolve={setOpen} />
        </InView>
      </div>
    </div>
  );
}
