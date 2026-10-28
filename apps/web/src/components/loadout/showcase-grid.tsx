import type { CSSProperties } from 'react';
import {
  ART_COMPACT,
  GRID_COLUMNS,
  ItemArt,
  TileBadge,
  TileCaption,
} from '@/components/inventory/item-tile';
import { TeamDots } from '@/components/team-dots';
import { holoStyle, type SkinPalette } from '@/components/vida/skin-ambient';
import type { ShowcaseView } from '@/lib/loadout/build';
import { showcaseSides } from '@/lib/team-sides';
import { cn } from '@/lib/utils';

/** Raras e StatTrak ganham o brilho holográfico tingido pela skin. */
const isHolo = (rarity: string, statTrak: boolean) =>
  statTrak || rarity === 'covert' || rarity === 'contraband' || rarity === 'classified';

/**
 * A vitrine do Loadout no Perfil (S05, V3): o que a Conta usa no jogo agora, só para ver. Cada Item diz em
 * que lado está, nas bolinhas TR/CT do site todo; o mesmo Item nos dois lados aparece uma vez. Um Item sem
 * lado (o kit de música) vale nos dois. Os cartões têm a cor da raridade ao fundo, inclinam com o ponteiro
 * e, nas raras e StatTrak, o holo tingido pela paleta da skin (que vem do servidor, em `palettes`).
 */
export function ShowcaseGrid({
  items,
  rarityLabels,
  palettes = {},
}: {
  items: ShowcaseView[];
  rarityLabels: Record<string, string>;
  /** A paleta de cada Item por `key` (de `skinPalette` no servidor); sem ela vale a cor da raridade. */
  palettes?: Record<string, SkinPalette>;
}) {
  return (
    <ul className={cn('grid gap-2.5', GRID_COLUMNS)} data-testid="showcase-items">
      {items.map((item, index) => {
        const rar = `var(--rarity-${item.rarity})`;
        const holo = isHolo(item.rarity, item.statTrak);
        return (
          <li
            key={item.key}
            style={
              {
                '--i': index,
                '--rar': rar,
                ...holoStyle(palettes[item.key], rar, { statTrak: item.statTrak }),
                backgroundImage: `radial-gradient(90% 70% at 50% 30%, color-mix(in srgb, ${rar} 30%, transparent), transparent 72%)`,
              } as CSSProperties
            }
            data-holo={
              holo
                ? item.rarity === 'covert' || item.rarity === 'contraband'
                  ? '2'
                  : '1'
                : undefined
            }
            className={cn(
              'v-tilt v-spot relative grid overflow-hidden enter-stagger content-start gap-2 rounded-xl bg-surface p-3 pb-3.5',
              holo && 'v-holo',
            )}
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
        );
      })}
    </ul>
  );
}
