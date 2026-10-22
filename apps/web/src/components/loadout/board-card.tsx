'use client';

import type { LoadoutSide } from '@carmine/contracts';
import type { CSSProperties } from 'react';
import { ItemArt, RARITY_COLOR } from '@/components/inventory/item-tile';
import { TeamDots } from '@/components/team-dots';
import type { SlotView } from '@/lib/loadout/view';
import { cn } from '@/lib/utils';

export type BoardCardLabels = {
  /** O nome que o cartão leva no canto superior direito (a arma, a faca, "Agente"...). */
  name: string;
  /** A skin (ou o modelo do agente e o kit) na base; nulo no cartão vazio. */
  skin: string | null;
  /** O que o leitor de tela ouve: slot, Item, lados e o aviso de fora do jogo. */
  accessible: string;
};

/**
 * Um cartão do quadro do Loadout, no desenho do menu de compra do CS2: número no canto superior
 * esquerdo, nome no direito, a skin equipada no centro (ou a Arma padrão apagada) e, na base, os
 * lados em que está equipada e o nome da skin. Selecionar mostra o slot na barra de baixo; o
 * foco anda pelo quadro com as setas (um único cartão está na ordem de tabulação).
 */
export function BoardCard({
  slot,
  number,
  index,
  sides,
  labels,
  selected,
  tabStop,
  onSelect,
}: {
  slot: SlotView;
  number: number;
  /** Posição na tela, para escalonar a entrada. */
  index: number;
  /** Os lados em que o Item do slot está equipado. */
  sides: LoadoutSide[];
  labels: BoardCardLabels;
  selected: boolean;
  /** O cartão que a tecla Tab alcança: um só no quadro (o selecionado, se estiver à vista). */
  tabStop: boolean;
  onSelect: () => void;
}) {
  const { item } = slot;
  const outOfGame = !!slot.notInGame || slot.strippedInGame.length > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={labels.accessible}
      tabIndex={tabStop ? 0 : -1}
      data-card
      data-key={slot.key}
      data-testid={`slot-${slot.slot}-${slot.side ?? 'all'}`}
      data-equipped={item ? item.uid : undefined}
      style={
        {
          '--i': index,
          ...(item ? { '--rc': RARITY_COLOR[item.rarity] } : {}),
        } as CSSProperties
      }
      className={cn(
        'group/card relative block aspect-3/2 w-full enter-stagger overflow-hidden rounded-md bg-surface-2/70 text-left',
        'transition-[background-color,box-shadow] duration-(--dur-fast) ease-std hover:bg-surface-2',
        'aria-pressed:bg-surface-2 aria-pressed:shadow-[inset_0_0_0_100vmax_var(--fill-selected)]',
        'focus-visible:outline-offset-[-3px]',
      )}
    >
      <span
        aria-hidden="true"
        className="absolute top-2 left-2.5 z-10 text-[11px] leading-none font-medium text-muted-foreground"
      >
        {number}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-[7px] right-2.5 z-10 max-w-[calc(100%-44px)] truncate text-xs leading-snug font-[650]',
          !item && 'font-semibold text-muted-foreground',
        )}
      >
        {labels.name}
      </span>
      {/* A arte nova (skin equipada ou desequipada) entra com um fade curto, sem troca seca. */}
      <span
        key={item?.uid ?? 'padrao'}
        aria-hidden="true"
        className="absolute inset-x-2 top-5 bottom-3.5 animate-fade-up"
      >
        {item ? (
          <ItemArt src={item.image} className={ART} />
        ) : slot.defaultImage ? (
          <ItemArt
            src={slot.defaultImage}
            className={cn(
              ART,
              // A Arma padrão em tom neutro; no tema claro ela escurece para não virar mancha bege.
              'opacity-40 grayscale group-hover/card:opacity-60',
              'light:opacity-50 light:brightness-[0.72] light:contrast-[1.15] light:group-hover/card:opacity-70',
            )}
          />
        ) : (
          <AgentSilhouette />
        )}
      </span>
      {item ? (
        <span className="absolute inset-x-[7px] bottom-[7px] z-10 flex items-center justify-between gap-1.5">
          <span className="inline-flex h-5 flex-none items-center gap-1.5 rounded-[6px] bg-surface/85 px-1.5 backdrop-blur-[6px] transition-colors duration-(--dur-fast) ease-std group-hover/card:bg-surface-2/90 group-aria-pressed/card:bg-surface-2/90">
            <TeamDots sides={sides} size="sm" />
            {item.statTrak ? (
              <span className="text-[11px] leading-none font-[650] tracking-[0.06em] text-muted-foreground">
                ST™
              </span>
            ) : null}
            {outOfGame ? (
              <span aria-hidden="true" className="size-1.5 rounded-full bg-status-vip" />
            ) : null}
          </span>
          <span
            title={labels.skin ?? undefined}
            className="ml-auto inline-flex h-5 min-w-0 items-center gap-1.5 rounded-[6px] bg-surface/85 px-1.5 text-[11.5px] leading-none font-[550] backdrop-blur-[6px] transition-colors duration-(--dur-fast) ease-std group-hover/card:bg-surface-2/90 group-aria-pressed/card:bg-surface-2/90"
          >
            <span className="truncate">{labels.skin}</span>
            <i aria-hidden="true" className="h-(--bar-h) w-2.5 flex-none rounded-full bg-(--rc)" />
          </span>
        </span>
      ) : null}
    </button>
  );
}

// `scale` é uma propriedade própria: `transition-[transform,...]` arbitrário não a anima.
const ART =
  'absolute inset-0 aspect-auto h-full w-full transition-[scale,opacity] duration-(--dur-zoom) ease-(--ease-soft) group-hover/card:scale-105 motion-reduce:group-hover/card:scale-100';

/** O agente padrão depende do mapa: uma silhueta neutra no lugar da imagem. */
function AgentSilhouette() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 48"
      className="absolute inset-0 m-auto block h-full w-auto text-faint opacity-60"
      fill="currentColor"
    >
      <circle cx="32" cy="15" r="7" />
      <path d="M18 46c0-9 6-16 14-16s14 7 14 16z" />
    </svg>
  );
}
