'use client';

import type { LoadoutSide } from '@carmine/contracts';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/animate-ui/components/radix/dropdown-menu';
import { LoadoutApiError, useEquip } from '@/components/loadout/use-equip';
import { hasSkinName } from '@/lib/catalog/types';
import type { CandidateView } from '@/lib/loadout/view';
import { equippedTeamSides } from '@/lib/team-sides';
import { cn } from '@/lib/utils';
import { VipBadge } from './catalog-grid';
import { useInventory } from './inventory-provider';
import { GRID_COLUMNS, ItemTile, TileBadge } from './item-tile';
import { RemoveItemDialog } from './remove-item-dialog';

/**
 * A grade do Inventário: cada cartão abre o editor; o menu do cartão equipa (nos lados em que
 * o Item existe) e remove (com os usos antes de confirmar e o "Desfazer" depois). O cartão que
 * acabou de mudar fica marcado.
 */
export function InventoryGrid({
  cards,
  rarityLabels,
  vip,
  equipped,
}: {
  cards: CandidateView[];
  rarityLabels: Record<string, string>;
  vip: { label: string; hint: string; active: boolean };
  /** Onde cada Item está equipado no Loadout: `uid` -> lados (`null` = music kit). */
  equipped: Record<string, (LoadoutSide | null)[]>;
}) {
  const t = useTranslations('inventory.card');
  const tl = useTranslations('loadout');
  const router = useRouter();
  const { highlight, notify } = useInventory();
  const { equip } = useEquip();
  const [removing, setRemoving] = useState<CandidateView | null>(null);
  const few = cards.length <= 2;
  const names = (uid: string) => cards.find((card) => card.uid === uid)?.name;

  async function equipCard(card: CandidateView, sides?: LoadoutSide[]) {
    try {
      await equip({ uid: card.uid, name: card.name, sides, names });
    } catch (caught) {
      const code = caught instanceof LoadoutApiError ? caught.code : 'network';
      if (code !== 'session')
        notify(code === 'unexpected' ? tl('notices.failed') : tl(`errors.${code}`));
    }
  }

  return (
    <>
      <ul
        className={cn(
          'grid gap-2.5',
          // Um ou dois Itens não ficam perdidos numa grade de cinco colunas: cartões maiores.
          few ? 'grid-cols-2 max-md:grid-cols-1' : GRID_COLUMNS,
        )}
        data-testid="inventory-grid"
      >
        {cards.map((card, index) => (
          <li
            key={card.uid}
            className="relative grid"
            data-testid="inventory-item"
            data-uid={card.uid}
          >
            <ItemTile
              href={`/inventario/${card.uid}`}
              title={card.title}
              subtitle={card.subtitle}
              skinFirst={hasSkinName(card.type)}
              sides={equippedTeamSides(equipped[card.uid])}
              stickers={card.stickers}
              charm={card.charm}
              image={card.image}
              palette={card.palette}
              rarity={card.rarity}
              rarityLabel={rarityLabels[card.rarity] ?? ''}
              statTrak={card.statTrak}
              foil={card.type === 'knife' || card.type === 'glove'}
              index={index}
              selected={highlight === card.uid}
              actionSpace
              compact={!few}
              badges={
                card.statTrak || (card.vip && !vip.active) ? (
                  <>
                    {card.statTrak ? <TileBadge>ST™</TileBadge> : null}
                    {card.vip && !vip.active ? (
                      <VipBadge label={vip.label} hint={vip.hint} />
                    ) : null}
                  </>
                ) : null
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t('actions', { name: card.name })}
                className="absolute right-1 bottom-1.5 grid size-(--tap) place-items-center rounded-md text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground aria-expanded:bg-hover"
                data-testid="item-menu"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                {card.slot === null ? null : card.sides === null ? (
                  <DropdownMenuItem onSelect={() => equipCard(card)} data-testid="menu-equip">
                    {t('equipIn.musicKit')}
                  </DropdownMenuItem>
                ) : (
                  <>
                    {card.sides.map((side) => (
                      <DropdownMenuItem
                        key={side}
                        onSelect={() => equipCard(card, [side])}
                        data-testid={`menu-equip-${side}`}
                      >
                        {t(`equipIn.${side}`)}
                      </DropdownMenuItem>
                    ))}
                    {card.sides.length > 1 ? (
                      <DropdownMenuItem
                        onSelect={() => equipCard(card, card.sides ?? undefined)}
                        data-testid="menu-equip-both"
                      >
                        {t('equipIn.both')}
                      </DropdownMenuItem>
                    ) : null}
                  </>
                )}
                <DropdownMenuItem onSelect={() => router.push(`/inventario/${card.uid}`)}>
                  {t('edit')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setRemoving(card)} data-testid="menu-remove">
                  {t('remove')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
      </ul>
      {removing ? (
        <RemoveItemDialog
          uid={removing.uid}
          name={removing.name}
          weaponName={removing.title}
          open
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
          onRemoved={() => {
            setRemoving(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
