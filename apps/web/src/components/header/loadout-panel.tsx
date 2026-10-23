'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { LoadoutSlotView, LoadoutView } from '@/lib/header-previews/view';
import { cn } from '@/lib/utils';
import { ItemImage, PanelFooterLink, WithView } from './preview-parts';

/**
 * O painel "Loadout": o retrato do Loadout no último lado usado (o mesmo que a tela guarda), com
 * faca, luvas, o rifle do lado e a AWP, e o Preset ativo. Cada Item leva ao editor dele; slot sem
 * Item mostra a arma padrão e leva ao Loadout. Sem sessão, um exemplo e "Monte o seu".
 */
export function LoadoutPanel() {
  return (
    <WithView>
      {(view) =>
        view.loadout ? (
          <LoadoutContent loadout={view.loadout} />
        ) : (
          <ExampleContent example={view.example} />
        )
      }
    </WithView>
  );
}

function LoadoutContent({ loadout }: { loadout: LoadoutView }) {
  const t = useTranslations('headerPreviews.loadout');
  const side = t(`side.${loadout.side}`);
  return (
    <div className="grid gap-3" data-testid="preview-loadout" data-side={loadout.side}>
      <p className="flex min-w-0 items-center gap-2 px-1 text-body-sm">
        <span
          aria-hidden="true"
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            loadout.side === 't' ? 'bg-side-t' : 'bg-side-ct',
          )}
        />
        <span className="shrink-0 font-semibold">{side}</span>
        <span className="truncate text-muted-foreground">
          {t('preset', { name: loadout.presetName })}
        </span>
      </p>
      <SlotGrid slots={loadout.slots} />
      <div className="flex justify-end border-t border-line pt-2">
        <PanelFooterLink href="/loadout">{t('open')}</PanelFooterLink>
      </div>
    </div>
  );
}

function SlotGrid({ slots }: { slots: LoadoutSlotView[] }) {
  return (
    <ul className="grid grid-cols-4 gap-2">
      {slots.map((slot) => (
        <li key={slot.slot}>
          <SlotTile slot={slot} />
        </li>
      ))}
    </ul>
  );
}

function SlotTile({ slot }: { slot: LoadoutSlotView }) {
  const t = useTranslations('headerPreviews.loadout');
  // Só faca e luvas têm um nome genérico para quando o slot está vazio e a arma padrão não tem nome.
  const generic =
    slot.slot === 'knife' ? t('slots.knife') : slot.slot === 'gloves' ? t('slots.gloves') : null;
  const title = slot.title ?? generic;
  const caption = slot.equipped
    ? [slot.statTrak ? t('statTrak') : null, slot.caption].filter(Boolean).join(' · ')
    : t('empty');
  return (
    <Link
      href={slot.href}
      data-testid="preview-slot"
      data-slot-name={slot.slot}
      data-equipped={slot.equipped || undefined}
      className="grid h-full content-start gap-1.5 rounded-lg bg-(--fill-rest) p-2 transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover)"
    >
      <ItemImage src={slot.image} className={slot.equipped ? undefined : 'opacity-60 grayscale'} />
      <span className="grid gap-0.5">
        <span className="line-clamp-2 text-caption leading-snug font-medium">{title}</span>
        <span className="truncate text-caption muted-on-fill">{caption}</span>
      </span>
    </Link>
  );
}

function ExampleContent({ example }: { example: LoadoutView | null }) {
  const t = useTranslations('headerPreviews.loadout');
  return (
    <div className="grid gap-3" data-testid="preview-loadout-example">
      <div className="grid gap-1 px-1">
        <p className="text-body-sm font-semibold">{t('exampleTitle')}</p>
        <p className="text-body-sm text-muted-foreground">{t('exampleBody')}</p>
      </div>
      {example ? <SlotGrid slots={example.slots} /> : null}
      <div className="flex justify-end border-t border-line pt-2">
        <Button asChild size="sm">
          <Link href="/loadout" data-testid="preview-build">
            {t('build')}
          </Link>
        </Button>
      </div>
    </div>
  );
}
