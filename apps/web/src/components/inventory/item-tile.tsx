import type { Route } from 'next';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import type { Rarity } from '@/lib/catalog/types';
import { cn } from '@/lib/utils';

/**
 * Cores de raridade do CS2. Não são da identidade Liberty: aparecem só no ponto ao lado do
 * nome (sinal pequeno), sempre acompanhado do nome da raridade para leitores de tela.
 */
export const RARITY_COLOR: Record<Rarity, string> = {
  consumer: '#b0c3d9',
  industrial: '#5e98d9',
  milspec: '#4b69ff',
  restricted: '#8847ff',
  classified: '#d32ce6',
  covert: '#eb4b4b',
  contraband: '#e4ae39',
};

export function RarityDot({ rarity, label }: { rarity: Rarity; label: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="inline-block size-1.5 shrink-0 rounded-full"
        style={{ background: RARITY_COLOR[rarity] }}
      />
      <span className="sr-only">{label}</span>
    </>
  );
}

/** A imagem do Item, contida e centrada; sem imagem, um vazio neutro do mesmo tamanho. */
export function ItemArt({
  src,
  className,
  priority = false,
}: {
  src: string;
  className?: string;
  priority?: boolean;
}) {
  if (!src) return <span aria-hidden="true" className={cn('block aspect-4/3', className)} />;
  return (
    // biome-ignore lint/performance/noImgElement: imagens da CDN da cs2-lib, sem otimização no Next (next.config).
    <img
      src={src}
      alt=""
      width={256}
      height={192}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('aspect-4/3 w-full object-contain', className)}
    />
  );
}

/**
 * Cartão de Item da Liberty (tela Loadout da referência): superfície sem borda que clareia no
 * hover, imagem no alto, arma em semibold e a skin em secundário. `badges` fica no canto
 * superior direito (StatTrak, VIP); `index` escalona a entrada.
 */
export function ItemTile({
  href,
  title,
  subtitle,
  image,
  rarity,
  rarityLabel,
  badges,
  meta,
  index = 0,
  selected = false,
  actionSpace = false,
  className,
  testId,
}: {
  href: string;
  title: string;
  subtitle: string | null;
  image: string;
  rarity: Rarity;
  rarityLabel: string;
  badges?: ReactNode;
  /** Linha de detalhe (ex.: "2 stickers · charm"). */
  meta?: string;
  index?: number;
  selected?: boolean;
  /** Reserva o canto inferior direito para um botão sobreposto (o menu do cartão). */
  actionSpace?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <Link
      href={href as Route}
      data-testid={testId}
      prefetch={false}
      style={{ '--i': index } as CSSProperties}
      className={cn(
        'group/tile relative grid enter-stagger content-start gap-2 rounded-lg bg-surface p-3 pb-3.5',
        'transition-[background-color,box-shadow] duration-(--dur-fast) ease-std hover:bg-surface-2',
        selected && 'bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--text)]',
        className,
      )}
    >
      <span className="relative block overflow-hidden rounded-md">
        <ItemArt
          src={image}
          className="transition-transform duration-(--dur-slow) ease-out group-hover/tile:scale-[1.04] motion-reduce:transform-none"
        />
      </span>
      <span className={cn('grid min-w-0 gap-0.5 pr-1', actionSpace && 'pr-9')}>
        <span className="truncate text-[13.5px] font-semibold">{title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <RarityDot rarity={rarity} label={rarityLabel} />
          <span className="truncate">{subtitle ?? rarityLabel}</span>
        </span>
        {meta ? (
          <span className="truncate pt-0.5 text-[11.5px] text-muted-foreground">{meta}</span>
        ) : null}
      </span>
      {badges ? (
        <span className="absolute top-2.5 right-2.5 flex items-center gap-1.5">{badges}</span>
      ) : null}
    </Link>
  );
}

/** Selo curto no canto do cartão: StatTrak, VIP. Texto em versalete, sem cor de fundo. */
export function TileBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm bg-background/80 px-1.5 py-1 label-caps text-[9.5px] tracking-[0.12em] text-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
