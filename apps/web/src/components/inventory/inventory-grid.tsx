'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/animate-ui/components/radix/dropdown-menu';
import type { InventoryCardData } from '@/lib/inventory/cards';
import { VipBadge } from './catalog-grid';
import { useInventory } from './inventory-provider';
import { ItemTile, TileBadge } from './item-tile';
import { RemoveItemDialog } from './remove-item-dialog';

/**
 * A grade do Inventário: cada cartão abre o editor; o menu do cartão também remove (com os
 * usos antes de confirmar e o "Desfazer" depois). O cartão que acabou de mudar fica marcado.
 */
export function InventoryGrid({
  cards,
  rarityLabels,
  vip,
}: {
  cards: InventoryCardData[];
  rarityLabels: Record<string, string>;
  vip: { label: string; hint: string; active: boolean };
}) {
  const t = useTranslations('inventory.card');
  const router = useRouter();
  const { highlight } = useInventory();
  const [removing, setRemoving] = useState<InventoryCardData | null>(null);

  return (
    <>
      <ul
        className="grid grid-cols-4 gap-2.5 max-lg:grid-cols-3 max-md:grid-cols-2"
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
              image={card.image}
              rarity={card.rarity}
              rarityLabel={rarityLabels[card.rarity] ?? ''}
              index={index}
              selected={highlight === card.uid}
              actionSpace
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
              meta={
                card.stickers || card.charm
                  ? [
                      card.stickers ? t('stickers', { count: card.stickers }) : null,
                      card.charm ? t('charm') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : undefined
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={t('actions', { name: card.name })}
                className="absolute right-2 bottom-2.5 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground aria-expanded:bg-hover max-md:size-(--tap) max-md:right-1 max-md:bottom-1"
                data-testid="item-menu"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-36">
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
