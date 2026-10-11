import { LockIcon } from '@/components/icons/animated/lock';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import type { CatalogEntry } from '@/lib/catalog/catalog';
import { ItemTile, TileBadge } from './item-tile';

/** Grade de Itens do catálogo; cada um abre o editor para adicionar. */
export function CatalogGrid({
  entries,
  rarityLabels,
  vipLabel,
  vipHint,
  tileClassName,
}: {
  entries: CatalogEntry[];
  rarityLabels: Record<string, string>;
  vipLabel: string;
  vipHint: string;
  tileClassName?: string;
}) {
  return (
    <ul className="grid grid-cols-4 gap-2.5 max-lg:grid-cols-3 max-md:grid-cols-2">
      {entries.map((entry, index) => (
        <li key={entry.id} className="grid">
          <ItemTile
            href={`/inventario/adicionar/${entry.id}`}
            testId={`catalog-item-${entry.id}`}
            title={entry.title}
            subtitle={entry.subtitle}
            image={entry.image}
            rarity={entry.rarity}
            rarityLabel={rarityLabels[entry.rarity] ?? ''}
            index={index}
            className={tileClassName}
            badges={entry.vip ? <VipBadge label={vipLabel} hint={vipHint} /> : null}
          />
        </li>
      ))}
    </ul>
  );
}

export function VipBadge({ label, hint }: { label: string; hint: string }) {
  return (
    <TileBadge>
      <AnimatedIcon icon={LockIcon} size={11} className="text-status-vip" />
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{hint}</span>
    </TileBadge>
  );
}
