import type { LoadoutSide } from '@carmine/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { TeamDots } from '@/components/team-dots';
import type { Rarity } from '@/lib/catalog/types';
import type { AttachmentLabel } from '@/lib/inventory/item-form';
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

/** A imagem mais baixa das grades de cinco colunas (Inventário e vitrine do Perfil). */
export const ART_COMPACT = 'aspect-2/1';

/** As colunas das grades de Itens (Inventário e vitrine): cinco, como os cartões do Loadout. */
export const GRID_COLUMNS = 'grid-cols-5 max-lg:grid-cols-3 max-md:grid-cols-2';

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
 * A legenda do cartão de Item: o nome da skin em destaque (nas armas, facas e luvas) e a arma em
 * secundário, ou o contrário nos demais; o ponto da raridade vai na linha de apoio.
 */
export function TileCaption({
  title,
  subtitle,
  skinFirst,
  rarity,
  rarityLabel,
  className,
}: {
  title: string;
  subtitle: string | null;
  skinFirst: boolean;
  rarity: Rarity;
  rarityLabel: string;
  className?: string;
}) {
  return (
    <span className={cn('grid min-w-0 gap-0.5 pr-1', className)}>
      <span className="truncate text-[14px] font-semibold">
        {skinFirst && subtitle ? subtitle : title}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <RarityDot rarity={rarity} label={rarityLabel} />
        <span className="truncate">
          {skinFirst && subtitle ? title : (subtitle ?? rarityLabel)}
        </span>
      </span>
    </span>
  );
}

/**
 * Cartão de Item da Liberty (tela Loadout da referência): superfície sem borda que clareia no
 * hover, imagem no alto, skin em destaque e a arma em secundário. No canto superior direito ficam
 * `badges` (StatTrak, VIP) e, por último, as bolinhas dos lados em que o Item está equipado
 * (`sides`); dentro da área da imagem, os stickers (embaixo à esquerda) e o chaveiro (embaixo à
 * direita). `index` escalona a entrada.
 */
export function ItemTile({
  href,
  title,
  subtitle,
  skinFirst = false,
  image,
  rarity,
  rarityLabel,
  badges,
  sides,
  stickers,
  charm,
  index = 0,
  selected = false,
  actionSpace = false,
  compact = false,
  className,
  testId,
}: {
  href: string;
  title: string;
  subtitle: string | null;
  /** Skins de arma, faca e luvas: o nome da skin domina e a arma vira a linha de apoio. */
  skinFirst?: boolean;
  image: string;
  rarity: Rarity;
  rarityLabel: string;
  badges?: ReactNode;
  /** Lados em que o Item está equipado: viram as bolinhas CT/TR no canto superior direito. */
  sides?: readonly LoadoutSide[];
  /** Stickers aplicados, em ícones no canto inferior esquerdo da imagem. */
  stickers?: readonly AttachmentLabel[];
  /** Chaveiro aplicado, em ícone no canto inferior direito da imagem. */
  charm?: AttachmentLabel | null;
  index?: number;
  selected?: boolean;
  /** Reserva o canto inferior direito para um botão sobreposto (o menu do cartão). */
  actionSpace?: boolean;
  /** Imagem mais baixa (2:1) para grades de cinco colunas, no tamanho dos cartões do Loadout. */
  compact?: boolean;
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
        'transition-[background-color,box-shadow] duration-(--dur-base) ease-std hover:bg-surface-2',
        selected && 'bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--text)]',
        className,
      )}
    >
      <span className="relative block overflow-hidden rounded-md">
        <ItemArt
          src={image}
          className={cn(
            compact && ART_COMPACT,
            'transition-[scale] duration-(--dur-zoom) ease-(--ease-soft) group-hover/tile:scale-[1.04] motion-reduce:group-hover/tile:scale-100',
          )}
        />
        {stickers?.length || charm ? (
          <span
            data-testid="tile-attachments"
            className="absolute inset-x-1.5 bottom-1 flex items-end justify-between gap-2"
          >
            <span className="flex min-w-0 items-end gap-0.5" data-testid="tile-stickers">
              {stickers?.map((sticker, index) => (
                <AttachmentIcon
                  // biome-ignore lint/suspicious/noArrayIndexKey: o mesmo sticker pode estar em dois slots.
                  key={`${sticker.id}-${index}`}
                  attachment={sticker}
                  className="h-4 md:h-[18px]"
                />
              ))}
            </span>
            {charm ? (
              <span data-testid="tile-charm">
                <AttachmentIcon attachment={charm} className="h-5 md:h-6" />
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
      <TileCaption
        title={title}
        subtitle={subtitle}
        skinFirst={skinFirst}
        rarity={rarity}
        rarityLabel={rarityLabel}
        className={actionSpace ? 'pr-12' : undefined}
      />
      {badges || sides?.length ? (
        <span className="absolute top-2.5 right-2.5 flex items-center gap-2">
          {badges}
          {sides?.length ? <TeamDots sides={sides} /> : null}
        </span>
      ) : null}
    </Link>
  );
}

/** Ícone pequeno e sem fundo de um sticker ou chaveiro, sobre a imagem da arma. */
function AttachmentIcon({
  attachment,
  className,
}: {
  attachment: AttachmentLabel;
  className?: string;
}) {
  if (!attachment.image) return <span className="sr-only">{attachment.name}</span>;
  return (
    // biome-ignore lint/performance/noImgElement: imagens da CDN da cs2-lib, sem otimização no Next.
    <img
      src={attachment.image}
      alt={attachment.name}
      title={attachment.name}
      width={40}
      height={30}
      loading="lazy"
      decoding="async"
      className={cn(
        'w-auto object-contain drop-shadow-[0_1px_2px_rgb(0_0_0/0.5)]',
        // Entra suave e dá um passo à frente com o cartão; sem movimento, só o fade curto.
        // `transition-[transform,...]` arbitrário não inclui `scale` nem `translate` (propriedades próprias).
        'transition-[scale,translate,opacity] duration-(--dur-base) ease-(--ease-out) starting:translate-y-1 starting:opacity-0',
        'group-hover/tile:scale-110 motion-reduce:starting:translate-y-0 motion-reduce:group-hover/tile:scale-100',
        className,
      )}
    />
  );
}

/** Selo curto no canto do cartão: StatTrak, VIP. Texto em versalete, sem cor de fundo. */
export function TileBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm bg-background/80 px-1.5 py-1 label-caps text-[11px] tracking-[0.1em] text-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}
