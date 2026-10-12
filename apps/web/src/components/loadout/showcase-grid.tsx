import type { CSSProperties } from 'react';
import { ItemArt, RarityDot, TileBadge } from '@/components/inventory/item-tile';
import type { ShowcaseView } from '@/lib/loadout/build';

/**
 * A vitrine do Loadout no Perfil (S05): o que a Conta usa no jogo agora, só para ver. Cada
 * Item diz em que lado está; o mesmo Item nos dois lados aparece uma vez.
 */
export function ShowcaseGrid({
  items,
  rarityLabels,
  sideLabels,
}: {
  items: ShowcaseView[];
  rarityLabels: Record<string, string>;
  sideLabels: { ct: string; t: string; both: string };
}) {
  const sidesOf = (sides: ShowcaseView['sides']) =>
    sides.length === 0 || sides.length === 2
      ? sideLabels.both
      : sides[0] === 'ct'
        ? sideLabels.ct
        : sideLabels.t;

  return (
    <ul
      className="grid grid-cols-4 gap-2.5 max-lg:grid-cols-3 max-md:grid-cols-2"
      data-testid="showcase-items"
    >
      {items.map((item, index) => (
        <li
          key={item.key}
          style={{ '--i': index } as CSSProperties}
          className="relative grid enter-stagger content-start gap-2 rounded-lg bg-surface p-3 pb-3.5"
          data-testid="showcase-item"
        >
          <ItemArt src={item.image} className="rounded-md" />
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate text-[13.5px] font-semibold">{item.title}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <RarityDot rarity={item.rarity} label={rarityLabels[item.rarity] ?? ''} />
              <span className="truncate">{item.subtitle ?? rarityLabels[item.rarity]}</span>
            </span>
          </span>
          <span className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
            {item.statTrak ? <TileBadge>ST™</TileBadge> : null}
            <TileBadge>{sidesOf(item.sides)}</TileBadge>
          </span>
        </li>
      ))}
    </ul>
  );
}
