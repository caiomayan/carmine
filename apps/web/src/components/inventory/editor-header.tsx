import type { CatalogEntry } from '@/lib/catalog/catalog';
import { BackLink } from './back-link';
import { RarityDot } from './item-tile';

/** Volta, o nome do Item (arma em pleno, skin em secundário) e raridade · tipo · coleção. */
export function EditorHeader({
  entry,
  back,
  rarityLabel,
  typeLabel,
}: {
  entry: CatalogEntry;
  back: { href: string; label: string };
  rarityLabel: string;
  typeLabel: string;
}) {
  return (
    <div className="grid animate-fade-up gap-2 pt-8 pb-6 max-md:pt-5 max-md:pb-4">
      <BackLink href={back.href}>{back.label}</BackLink>
      <h1 className="text-display max-md:text-[26px]">
        {entry.title}
        {entry.subtitle ? (
          <>
            <span
              aria-hidden="true"
              className="mx-2.5 inline-block h-[0.8em] w-px translate-y-[0.08em] bg-line-strong"
            />
            <span className="sr-only"> | </span>
            <span className="text-muted-foreground">{entry.subtitle}</span>
          </>
        ) : null}
      </h1>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <RarityDot rarity={entry.rarity} label="" />
          {rarityLabel}
        </span>
        <span aria-hidden="true">·</span>
        <span>{typeLabel}</span>
        {entry.collection ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{entry.collection}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
