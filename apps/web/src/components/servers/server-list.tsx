import type { CSSProperties } from 'react';
import type { ServersLayout } from '@/lib/live-servers';
import { cn } from '@/lib/utils';

type Columns = { server: string; map: string; players: string; state: string };

/**
 * Grade da lista da Liberty (acima de 6 servidores no ar): servidor, mapa, jogadores, estado e
 * ações (Jogar e copiar o IP). Fica aqui, fora do módulo de cliente, para o servidor também usar.
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
 * A grade dos cartões: 1 coluna no celular, 2 a partir do `md` e, com 3 ou 6 servidores, 3 no
 * `xl`. Um cartão sozinho na última linha (colunas ímpares) ocupa a linha inteira.
 */
export function cardsGridClass(columns: ServersLayout['columns']): string {
  const base = 'grid grid-cols-1 gap-3 md:gap-4';
  if (columns === 1) return base;
  if (columns === 2) {
    return cn(base, 'md:grid-cols-2 md:[&>li:last-child:nth-child(odd)]:col-span-2');
  }
  return cn(
    base,
    'md:grid-cols-2 xl:grid-cols-3 md:max-xl:[&>li:last-child:nth-child(odd)]:col-span-2',
  );
}

/** `sizes` da imagem do mapa conforme a grade: o navegador escolhe 800 ou 1600 px. */
export function cardsImageSizes(columns: ServersLayout['columns']): string {
  if (columns === 1) return '(max-width: 760px) 100vw, 1080px';
  if (columns === 2) return '(max-width: 760px) 100vw, 540px';
  return '(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 360px';
}

/**
 * Silhueta de um cartão. `loading` liga a varredura do skeleton; sem ela é só a forma (fundo do
 * estado vazio). Sempre decorativa para leitores de tela.
 */
export function ServerCardSkeleton({
  index = 0,
  loading = false,
}: {
  index?: number;
  loading?: boolean;
}) {
  const bone = cn('block rounded-sm', loading ? 'shimmer' : 'bg-surface-2');
  return (
    <li
      aria-hidden="true"
      className="enter-stagger flex min-h-[264px] flex-col justify-between rounded-2xl bg-surface p-4 md:p-5"
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-start justify-between">
        <span className={cn(bone, 'h-[22px] w-[72px]')} />
        <span className={cn(bone, 'h-[22px] w-[84px]')} />
      </div>
      <div className="grid gap-4">
        <span className="grid gap-2">
          <span className={cn(bone, 'h-[18px] w-[min(200px,70%)]')} />
          <span className={cn(bone, 'h-[12px] w-[min(140px,50%)]')} />
        </span>
        <span className={cn(bone, 'h-[3px] w-full')} />
        <span className={cn(bone, 'h-(--tap) w-[104px] max-md:w-full md:ml-auto')} />
      </div>
    </li>
  );
}

/** Os cartões fantasma do carregamento (e do estado vazio, esmaecidos por quem os usa). */
export function ServerCardsSkeleton({
  count = 3,
  loading = false,
}: {
  count?: number;
  loading?: boolean;
}) {
  return (
    <ul aria-hidden="true" className={cardsGridClass(count === 3 ? 3 : 2)}>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: silhuetas idênticas e sem estado.
        <ServerCardSkeleton key={i} index={i} loading={loading} />
      ))}
    </ul>
  );
}
