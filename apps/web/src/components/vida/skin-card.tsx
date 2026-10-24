import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { isHolo, RARITY_LABEL, type SkinInfo } from './data';
import { DynamicButton } from './dynamic-button';

const RARITY_INK: Record<SkinInfo['rarity'], string> = {
  consumer: '#0e1116',
  industrial: '#06121f',
  milspec: '#ffffff',
  restricted: '#ffffff',
  classified: '#ffffff',
  covert: '#ffffff',
  contraband: '#1c1405',
};

/** Etiqueta cheia na cor da raridade: as raridades aparecem com orgulho. */
export function RarityTag({ rarity, className }: { rarity: SkinInfo['rarity']; className?: string }) {
  return (
    <span
      style={{ background: `var(--rarity-${rarity})`, color: RARITY_INK[rarity] }}
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-[5px] text-[11px] leading-none font-extrabold tracking-[0.14em] uppercase',
        className,
      )}
    >
      {RARITY_LABEL[rarity]}
    </span>
  );
}

export function SideDots({ sides, className }: { sides: ('ct' | 't')[]; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {sides.includes('ct') ? (
        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-side-ct">
          <span aria-hidden="true" className="size-2 rounded-full bg-side-ct" />
          CT
        </span>
      ) : null}
      {sides.includes('t') ? (
        <span className="inline-flex items-center gap-1 text-[12px] font-bold text-side-t">
          <span aria-hidden="true" className="size-2 rounded-full bg-side-t" />
          TR
        </span>
      ) : null}
    </span>
  );
}

/**
 * Cartão de skin: arte grande sobre um fundo que tem a cor da raridade, inclinação 3D com o ponteiro e,
 * nas raras e StatTrak, o brilho holográfico (as duas coisas vêm do CSS e do `Effects`). `equip` põe o
 * botão dinâmico "Equipar".
 */
export function SkinCard({
  skin,
  statTrak = false,
  sides,
  meta,
  size = 'md',
  equip = false,
  className,
}: {
  skin: SkinInfo;
  statTrak?: boolean;
  sides?: ('ct' | 't')[];
  /** Linha pequena sob o nome (de quem é). */
  meta?: ReactNode;
  size?: 'md' | 'lg';
  equip?: boolean;
  className?: string;
}) {
  const holo = isHolo(skin.rarity, statTrak);
  const rar = `var(--rarity-${skin.rarity})`;
  return (
    <figure
      data-holo={
        holo ? (skin.rarity === 'contraband' || skin.rarity === 'covert' ? '2' : '1') : undefined
      }
      style={{ '--rar': rar } as CSSProperties}
      className={cn(
        'v-tilt v-spot relative isolate m-0 flex flex-col overflow-hidden rounded-xl bg-surface',
        holo && 'v-holo',
        size === 'lg' ? 'min-h-[360px] p-6' : 'min-h-[236px] p-4',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background: `radial-gradient(90% 80% at 50% 38%, color-mix(in srgb, ${rar} 42%, transparent), transparent 70%), linear-gradient(180deg, color-mix(in srgb, ${rar} 12%, var(--surface)), var(--surface))`,
        }}
      />
      <div className="flex items-start justify-between gap-2">
        <RarityTag rarity={skin.rarity} />
        {statTrak ? (
          <span className="rounded-sm bg-[#cf6a1f] px-2 py-[5px] text-[11px] leading-none font-extrabold tracking-[0.14em] text-white uppercase">
            StatTrak™
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          'relative grid flex-1 place-items-center py-3',
          size === 'lg' ? 'min-h-[200px]' : 'min-h-[110px]',
        )}
      >
        {/* Arte da skin (CDN da cs2-lib): sem otimização, como no resto do site. */}
        {/* biome-ignore lint/performance/noImgElement: imagem externa da CDN */}
        <img
          src={skin.image}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(
            'w-full object-contain drop-shadow-[0_18px_22px_rgb(0_0_0/0.45)] transform-[translateZ(46px)]',
            size === 'lg' ? 'max-h-[260px]' : 'max-h-[130px]',
          )}
        />
      </div>
      <figcaption className="grid gap-1">
        <span className="text-caption text-muted-foreground">{skin.title}</span>
        <span
          className={cn(size === 'lg' ? 'v-serif text-[48px] text-foreground' : 'text-[22px] leading-[1.05] font-bold tracking-[-0.025em] text-foreground')}
        >
          {skin.subtitle ?? skin.title}
        </span>
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-1">
          {meta ? <span className="text-body-sm text-muted-foreground">{meta}</span> : <span />}
          {sides ? <SideDots sides={sides} /> : null}
        </span>
        {equip ? (
          <DynamicButton
            idle="Equipar"
            loading="Equipando"
            done="Equipado"
            variant="quiet"
            className="mt-2 w-full"
            testId="vida-equip"
          />
        ) : null}
      </figcaption>
    </figure>
  );
}
