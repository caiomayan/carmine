import type { CSSProperties } from 'react';
import {
  ART_COMPACT,
  GRID_COLUMNS,
  ItemArt,
  TileBadge,
  TileCaption,
} from '@/components/inventory/item-tile';
import { TeamDots } from '@/components/team-dots';
import type { ShowcaseView } from '@/lib/loadout/build';
import { showcaseSides } from '@/lib/team-sides';
import { cn } from '@/lib/utils';

/**
 * A vitrine do Loadout no Perfil (S05): o que a Conta usa no jogo agora, só para ver. Cada
 * Item diz em que lado está, nas bolinhas TR/CT do site todo; o mesmo Item nos dois lados aparece
 * uma vez. Um Item sem lado (o kit de música) vale nos dois.
 */
export function ShowcaseGrid({
  items,
  rarityLabels,
}: {
  items: ShowcaseView[];
  rarityLabels: Record<string, string>;
}) {
  return (
    <ul className={cn('grid gap-2.5', GRID_COLUMNS)} data-testid="showcase-items">
      {items.map((item, index) => (
        <li
          key={item.key}
          style={{ '--i': index } as CSSProperties}
          className="relative grid enter-stagger content-start gap-2 rounded-lg bg-surface p-3 pb-3.5"
          data-testid="showcase-item"
        >
          <ItemArt src={item.image} className={cn('rounded-lg', ART_COMPACT)} />
          <TileCaption
            title={item.title}
            subtitle={item.subtitle}
            skinFirst={item.skinFirst}
            rarity={item.rarity}
            rarityLabel={rarityLabels[item.rarity] ?? ''}
          />
          <span className="absolute top-2.5 right-2.5 flex items-center gap-2">
            {item.statTrak ? <TileBadge>ST™</TileBadge> : null}
            <TeamDots sides={showcaseSides(item.sides)} />
          </span>
        </li>
      ))}
    </ul>
  );
}
