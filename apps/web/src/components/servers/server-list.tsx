import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

type Columns = { server: string; map: string; players: string; state: string };

/**
 * Grade da lista da Liberty: servidor, mapa, jogadores, estado e ações (Conectar e copiar o
 * IP). Fica aqui, fora do módulo de cliente, para o skeleton do servidor usar a mesma.
 */
export const SERVER_GRID = cn(
  'md:grid md:items-center md:gap-4',
  'md:grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_minmax(0,1fr)_80px_148px]',
);

export function ServerListColumns({ labels }: { labels: Columns }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        SERVER_GRID,
        'hidden border-b border-line px-3 pt-1.5 pb-2.5 label-caps text-muted-foreground',
      )}
    >
      <span>{labels.server}</span>
      <span>{labels.map}</span>
      <span>{labels.players}</span>
      <span>{labels.state}</span>
      <span />
    </div>
  );
}

/**
 * Linha de servidor sem dados. `loading` liga a varredura do skeleton; sem ela a linha é só a
 * silhueta da lista (fundo do estado vazio). Sempre decorativa para leitores de tela.
 */
export function ServerRowSkeleton({
  index = 0,
  loading = false,
}: {
  index?: number;
  loading?: boolean;
}) {
  const bone = cn('block rounded-sm', loading ? 'shimmer' : 'bg-surface-2');
  return (
    <div
      className={cn(
        SERVER_GRID,
        'mb-0.5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg px-3 py-4 enter-stagger [grid-template-areas:"main_main""map_players""state_btn"] md:min-h-[68px] md:py-3.5 md:[grid-template-areas:none]',
      )}
      style={{ '--i': index } as CSSProperties}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 [grid-area:main] md:[grid-area:auto]">
        <span className={cn(bone, 'h-[18px] w-[64px]')} />
        <span className="grid gap-1.5">
          <span className={cn(bone, 'h-[13px] w-[min(180px,80%)]')} />
          <span className={cn(bone, 'h-[10px] w-[min(110px,55%)]')} />
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2.5 [grid-area:map] md:[grid-area:auto]">
        <span className="grid flex-1 gap-1.5">
          <span className={cn(bone, 'h-[13px] w-[72px]')} />
          <span className={cn(bone, 'h-[10px] w-[min(110px,55%)]')} />
        </span>
      </div>
      <div className="grid gap-2 [grid-area:players] md:[grid-area:auto]">
        <span className={cn(bone, 'h-[13px] w-11')} />
        <span className={cn(bone, 'h-[3px] w-full')} />
      </div>
      <div className="self-center [grid-area:state] md:[grid-area:auto]">
        <span className={cn(bone, 'h-[10px] w-14')} />
      </div>
      <span
        className={cn(
          bone,
          'h-(--tap) w-full rounded-md [grid-area:btn] md:w-[100px] md:justify-self-end md:[grid-area:auto]',
        )}
      />
    </div>
  );
}
