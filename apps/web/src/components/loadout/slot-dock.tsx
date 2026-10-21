'use client';

import type { LoadoutSide } from '@carmine/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LockIcon } from '@/components/icons/animated/lock';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { ItemArt, RARITY_COLOR } from '@/components/inventory/item-tile';
import { Button } from '@/components/ui/button';
import type { CandidateView, SlotView } from '@/lib/loadout/view';
import { cn } from '@/lib/utils';
import { TeamDots } from '../team-dots';
import { LoadoutApiError, useEquip } from './use-equip';

/**
 * O slot selecionado, fixo na base da tela (S05): o que está nele, os lados, o aviso de fora do
 * jogo e as ações rápidas. Escolher outro Item abre a folha do seletor (`onPick`).
 */
export function SlotDock({
  slot,
  title,
  sides,
  otherSide,
  equippedCandidate,
  rarityLabel,
  readOnly,
  flash,
  names,
  onPick,
  onChanged,
}: {
  slot: SlotView;
  /** "AK-47", "Faca", "Kit de música"... */
  title: string;
  /** Os lados em que o Item do slot está equipado. */
  sides: LoadoutSide[];
  /** O outro lado, se o slot também existe nele e o Item cabe lá sem já estar equipado. */
  otherSide: LoadoutSide | null;
  equippedCandidate: CandidateView | null;
  rarityLabel: string;
  readOnly: boolean;
  /** Muda a cada equipar/desequipar: o painel pisca uma vez. */
  flash: number;
  names: (uid: string) => string | undefined;
  onPick: () => void;
  /** Depois de equipar ou desequipar por aqui. */
  onChanged: () => void;
}) {
  const t = useTranslations('loadout');
  const { equip, unequip } = useEquip();
  const [pending, setPending] = useState<'also' | 'unequip' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { item } = slot;
  const gear = slot.group === 'gear';
  const strippedNames = slot.strippedInGame.map((attribute) => t(`stripped.${attribute}`));
  const hasNote = !!slot.notInGame || strippedNames.length > 0;

  const fail = (caught: unknown) => {
    const code = caught instanceof LoadoutApiError ? caught.code : 'network';
    if (code !== 'session')
      setError(code === 'unexpected' ? t('notices.failed') : t(`errors.${code}`));
  };

  async function alsoOnOtherSide() {
    if (!item || !otherSide || !equippedCandidate) return;
    setPending('also');
    setError(null);
    try {
      await equip({ uid: item.uid, name: equippedCandidate.name, sides: [otherSide], names });
      onChanged();
    } catch (caught) {
      fail(caught);
    } finally {
      setPending(null);
    }
  }

  async function clear() {
    setPending('unequip');
    setError(null);
    try {
      await unequip({
        slot: slot.slot,
        slotName: title,
        ...(slot.side ? { sides: [slot.side] } : {}),
      });
      onChanged();
    } catch (caught) {
      fail(caught);
    } finally {
      setPending(null);
    }
  }

  const art = item ? item.image : slot.defaultImage;

  return (
    <aside
      aria-label={t('panel.label')}
      data-testid="slot-dock"
      data-slot-key={slot.key}
      className={cn(
        'relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 rounded-xl bg-surface-2 p-2.5 pr-3',
        'shadow-[0_10px_32px_-6px_var(--shadow),inset_0_0_0_1px_var(--line)]',
        'max-md:grid-cols-[auto_minmax(0,1fr)]',
      )}
    >
      {flash > 0 ? (
        <span
          key={flash}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-xl bg-foreground/15 animate-[dock-flash_520ms_var(--ease-out)_forwards] motion-reduce:hidden"
        />
      ) : null}
      <span
        className={cn(
          'block h-14 w-[76px] overflow-hidden rounded-md bg-surface max-md:h-12 max-md:w-16',
          !item && 'opacity-40 grayscale',
        )}
      >
        {art ? <ItemArt src={art} className="aspect-auto h-full w-full" /> : null}
      </span>

      <div className="grid min-w-0 gap-0.5">
        <p className="flex min-w-0 items-center gap-2.5 text-md leading-snug font-[650]">
          <span className="truncate" data-testid="dock-title">
            {item
              ? `${item.title}${item.subtitle ? ` · ${item.subtitle}` : ''}`
              : (slot.defaultName ?? title)}
          </span>
          <TeamDots sides={sides} />
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          {item ? (
            <>
              <span>{title}</span>
              <i
                aria-hidden="true"
                className="h-[3px] w-2.5 rounded-full"
                style={{ background: RARITY_COLOR[item.rarity] }}
              />
              <span>
                {rarityLabel}
                {item.statTrak ? ' · StatTrak™' : ''}
              </span>
            </>
          ) : (
            <span>{gear ? t('panel.emptyGear') : t('panel.empty')}</span>
          )}
        </p>
      </div>

      {readOnly ? (
        <p className="col-span-full text-sm">{t('panel.readOnly')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-1 max-md:col-span-full">
          {otherSide && item ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={alsoOnOtherSide}
              disabled={pending !== null}
              data-testid="dock-also"
              className="max-md:flex-1"
            >
              <TeamDots sides={[otherSide]} size="sm" />
              {t('panel.bothSides', { side: t(`sidesShort.${otherSide}`) })}
            </Button>
          ) : null}
          {item ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              disabled={pending !== null}
              data-testid="dock-unequip"
              className="max-md:flex-1"
            >
              {t('panel.unequip')}
            </Button>
          ) : null}
          {item ? (
            <Button asChild variant="ghost" size="sm" className="max-md:flex-1">
              <Link href={`/inventario/${item.uid}` as Route} prefetch={false}>
                {t('panel.edit')}
              </Link>
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={onPick}
            disabled={pending !== null}
            data-testid="dock-pick"
            className="max-md:flex-1"
          >
            {item ? t('panel.pick') : t('panel.pickEmpty')}
          </Button>
        </div>
      )}

      {hasNote ? (
        <div
          role="note"
          data-testid="not-in-game-note"
          data-icon-trigger
          className="col-span-full flex items-start gap-3 rounded-md bg-surface px-3 py-2.5 text-sm leading-[1.55]"
        >
          <AnimatedIcon icon={LockIcon} size={15} className="mt-0.5 text-status-vip" />
          <p>
            {slot.notInGame
              ? t(`notInGame.${slot.notInGame}`)
              : t('stripped.body', { attributes: strippedNames.join(' e ') })}
          </p>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="panel-error"
          className="col-span-full flex items-start gap-2 text-sm"
        >
          <span
            aria-hidden="true"
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
          />
          {error}
        </p>
      ) : null}
    </aside>
  );
}
