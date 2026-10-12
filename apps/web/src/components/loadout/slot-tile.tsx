'use client';

import type { CSSProperties } from 'react';
import { ItemArt, RarityDot, TileBadge } from '@/components/inventory/item-tile';
import type { SlotView } from '@/lib/loadout/view';
import { cn } from '@/lib/utils';

export type SlotTileLabels = {
  /** Nome do slot de faca, luvas, agente e music kit. */
  slotName: string | null;
  /** Linha de apoio do slot vazio ("Arma padrão", "Padrão do jogo"). */
  defaultLine: string;
  /** Título do slot vazio de faca, luvas, agente e music kit ("Padrão do jogo"). */
  defaultTitle: string;
  rarity: string;
  notInGame: string;
};

/**
 * Um slot do Loadout (S05): o Item equipado ou, vazio, a Arma padrão apagada. Selecionar abre o
 * painel do slot. Um Item que não vai para o jogo leva um sinal pequeno com a cor de contexto
 * do VIP; a explicação fica no painel.
 */
export function SlotTile({
  slot,
  labels,
  selected,
  highlighted,
  index,
  onSelect,
}: {
  slot: SlotView;
  labels: SlotTileLabels;
  selected: boolean;
  highlighted: boolean;
  index: number;
  onSelect: () => void;
}) {
  const { item } = slot;
  const outOfGame = !!slot.notInGame || slot.strippedInGame.length > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid={`slot-${slot.slot}-${slot.side ?? 'all'}`}
      data-equipped={item ? item.uid : undefined}
      style={{ '--i': index } as CSSProperties}
      className={cn(
        'group/slot relative grid enter-stagger content-start gap-2 rounded-lg bg-surface p-3 pb-3.5 text-left max-md:p-2.5',
        'transition-[background-color,box-shadow] duration-(--dur-fast) ease-std hover:bg-surface-2',
        'aria-pressed:bg-surface-2 aria-pressed:shadow-[inset_0_0_0_1.5px_var(--text)]',
        highlighted && 'animate-[slot-flash_1.2s_var(--ease-out)_1] motion-reduce:animate-none',
      )}
    >
      <span className="relative block overflow-hidden rounded-md">
        {item ? (
          <ItemArt
            src={item.image}
            className="transition-transform duration-(--dur-slow) ease-out group-hover/slot:scale-[1.04] motion-reduce:transform-none"
          />
        ) : slot.defaultImage ? (
          <ItemArt
            src={slot.defaultImage}
            className="opacity-35 grayscale transition-opacity duration-(--dur-fast) ease-std group-hover/slot:opacity-55"
          />
        ) : (
          <AgentSilhouette />
        )}
      </span>
      <span className="grid min-w-0 gap-0.5 pr-1">
        {labels.slotName ? (
          <span className="label-caps text-[9.5px] text-muted-foreground">{labels.slotName}</span>
        ) : null}
        <span
          className={cn('truncate text-[13.5px] font-semibold', !item && 'text-muted-foreground')}
        >
          {item
            ? item.title
            : labels.slotName
              ? labels.defaultTitle
              : (slot.defaultName ?? labels.defaultTitle)}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {item ? <RarityDot rarity={item.rarity} label={labels.rarity} /> : null}
          {/* Vazio, faca e luvas não repetem "padrão": a linha fica, para o cartão não encolher. */}
          <span className="truncate">
            {item ? (item.subtitle ?? labels.rarity) : labels.slotName ? ' ' : labels.defaultLine}
          </span>
        </span>
      </span>
      {item?.statTrak || outOfGame ? (
        <span className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
          {item?.statTrak ? <TileBadge>ST™</TileBadge> : null}
          {outOfGame ? (
            <span data-testid="not-in-game" className="flex">
              <TileBadge>
                <span aria-hidden="true" className="size-1.5 rounded-full bg-status-vip" />
                {labels.notInGame}
              </TileBadge>
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

/** O agente padrão depende do mapa: uma silhueta neutra no lugar da imagem. */
function AgentSilhouette() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 48"
      className="block aspect-4/3 w-full text-faint opacity-60"
      fill="currentColor"
    >
      <circle cx="32" cy="15" r="7" />
      <path d="M18 46c0-9 6-16 14-16s14 7 14 16z" />
    </svg>
  );
}
