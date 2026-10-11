'use client';

import type { LoadoutSide } from '@carmine/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { CheckIcon } from '@/components/icons/animated/check';
import { LockIcon } from '@/components/icons/animated/lock';
import { PlusIcon } from '@/components/icons/animated/plus';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { ItemArt, RarityDot, TileBadge } from '@/components/inventory/item-tile';
import { Button } from '@/components/ui/button';
import type { CandidateView, SlotView } from '@/lib/loadout/view';
import { cn } from '@/lib/utils';
import { LoadoutApiError, useEquip } from './use-equip';

/**
 * O painel do slot selecionado (S05): o que está nele, o que não vai para o jogo e por quê, e
 * os Itens do Inventário que cabem ali. Equipar escolhe o lado (este ou os dois); equipar sobre
 * outro Item o substitui, com o "Desfazer" no aviso.
 */
export function SlotPanel({
  slot,
  title,
  sideName,
  otherSide,
  candidates,
  readOnly,
  catalogHref,
  rarityLabels,
  names,
  onEquipped,
}: {
  slot: SlotView;
  /** "AK-47", "Faca", "Music kit"... */
  title: string;
  /** O lado do slot por extenso; nulo no music kit. */
  sideName: string | null;
  /** O outro lado, se o slot também existe nele. */
  otherSide: LoadoutSide | null;
  candidates: CandidateView[];
  readOnly: boolean;
  catalogHref: string;
  rarityLabels: Record<string, string>;
  names: (uid: string) => string | undefined;
  onEquipped?: (uid: string) => void;
}) {
  const t = useTranslations('loadout');
  const { equip, unequip } = useEquip();
  const [bothSides, setBothSides] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bothId = useId();
  const { item } = slot;
  const gear = slot.group === 'gear';

  const fail = (caught: unknown) => {
    const code = caught instanceof LoadoutApiError ? caught.code : 'network';
    if (code !== 'session')
      setError(code === 'unexpected' ? t('notices.failed') : t(`errors.${code}`));
  };

  async function choose(candidate: CandidateView) {
    setPending(candidate.uid);
    setError(null);
    try {
      const sides: LoadoutSide[] | undefined = slot.side
        ? otherSide && bothSides && candidate.sides?.includes(otherSide)
          ? [slot.side, otherSide]
          : [slot.side]
        : undefined;
      await equip({ uid: candidate.uid, name: candidate.name, sides, names });
      onEquipped?.(candidate.uid);
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
    } catch (caught) {
      fail(caught);
    } finally {
      setPending(null);
    }
  }

  const strippedNames = slot.strippedInGame.map((attribute) => t(`stripped.${attribute}`));

  return (
    <div className="grid gap-5" data-testid="slot-panel" data-slot-key={slot.key}>
      <div className="grid gap-3">
        <p className="label-caps text-[10.5px] text-muted-foreground">
          {sideName ? `${title} · ${sideName}` : title}
        </p>
        <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-4">
          <span className="block overflow-hidden rounded-md bg-surface-2/70">
            {item ? (
              <ItemArt src={item.image} priority />
            ) : slot.defaultImage ? (
              <ItemArt src={slot.defaultImage} className="opacity-35 grayscale" priority />
            ) : (
              <span aria-hidden="true" className="block aspect-4/3" />
            )}
          </span>
          <div className="grid min-w-0 gap-0.5">
            <h2
              className="text-md leading-snug font-semibold text-balance"
              data-testid="panel-title"
            >
              {item ? item.name : (slot.defaultName ?? t('defaultAgent'))}
            </h2>
            <p className="text-[12.5px] text-muted-foreground">
              {item ? t('panel.current') : gear ? t('panel.emptyGear') : t('panel.empty')}
            </p>
          </div>
        </div>
      </div>

      {slot.notInGame || strippedNames.length > 0 ? (
        <div
          role="note"
          data-testid="not-in-game-note"
          data-icon-trigger
          className="flex items-start gap-3 rounded-lg bg-surface px-4 py-3 text-[13px] leading-[1.55]"
        >
          <AnimatedIcon icon={LockIcon} size={15} className="mt-0.5 text-status-vip" />
          <p>
            {slot.notInGame
              ? t(`notInGame.${slot.notInGame}`)
              : t('stripped.body', { attributes: strippedNames.join(' e ') })}
          </p>
        </div>
      ) : null}

      {readOnly ? (
        <p className="rounded-lg bg-surface px-4 py-3 text-[13px] leading-[1.55]">
          {t('panel.readOnly')}
        </p>
      ) : item ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={pending !== null}
            data-testid="unequip"
          >
            {t('panel.unequip')}
          </Button>
          <Button asChild variant="quiet" size="sm">
            <Link href={`/inventario/${item.uid}` as Route} prefetch={false}>
              {t('panel.edit')}
            </Link>
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-[13px]" data-testid="panel-error">
          <span
            aria-hidden="true"
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
          />
          {error}
        </p>
      ) : null}

      {readOnly ? null : (
        <section aria-labelledby={`${bothId}-title`} className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h3 id={`${bothId}-title`} className="label-caps text-[10.5px]">
              {t('panel.choose')}
            </h3>
            {/* Só quando algum Item cabe nos dois lados (um agente é de um time só). */}
            {otherSide && candidates.some((c) => c.sides?.includes(otherSide)) ? (
              <Button
                type="button"
                variant="quiet"
                size="sm"
                aria-pressed={bothSides}
                onClick={() => setBothSides((on) => !on)}
                className="-mr-2 gap-2 text-[12.5px] aria-pressed:bg-hover aria-pressed:text-foreground"
                data-testid="both-sides"
                data-icon-trigger
              >
                <span
                  aria-hidden="true"
                  className="grid size-3.5 place-items-center rounded-[4px] shadow-[inset_0_0_0_1.5px_currentColor]"
                >
                  {bothSides ? <AnimatedIcon icon={CheckIcon} size={10} /> : null}
                </span>
                {t('panel.bothSides', { side: t(`sidesShort.${otherSide}`) })}
              </Button>
            ) : null}
          </div>

          {candidates.length === 0 ? (
            <div className="grid justify-items-start gap-3 rounded-lg bg-surface px-4 py-4 text-[13px]">
              <p className="text-muted-foreground">{t('panel.none')}</p>
              <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link href={catalogHref as Route}>
                  <AnimatedIcon icon={PlusIcon} size={15} />
                  {t('panel.addFromCatalog')}
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="grid gap-1" data-testid="slot-candidates">
              {candidates.map((candidate) => {
                const current = candidate.uid === item?.uid;
                return (
                  <li key={candidate.uid}>
                    <button
                      type="button"
                      disabled={current || pending !== null}
                      onClick={() => choose(candidate)}
                      aria-label={t('panel.equip', { name: candidate.name })}
                      data-testid="candidate"
                      data-uid={candidate.uid}
                      className={cn(
                        'grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-md p-1.5 pr-3 text-left',
                        'transition-colors duration-(--dur-fast) ease-std hover:bg-hover disabled:hover:bg-transparent',
                        current && 'bg-surface',
                        pending === candidate.uid && 'animate-pulse motion-reduce:animate-none',
                      )}
                    >
                      <span className="block overflow-hidden rounded-sm bg-surface-2/60">
                        <ItemArt src={candidate.image} />
                      </span>
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate text-[13px] font-semibold">
                          {candidate.title}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
                          <RarityDot
                            rarity={candidate.rarity}
                            label={rarityLabels[candidate.rarity] ?? ''}
                          />
                          <span className="truncate">
                            {candidate.subtitle ?? rarityLabels[candidate.rarity]}
                          </span>
                        </span>
                      </span>
                      {current ? (
                        <TileBadge>{t('panel.current')}</TileBadge>
                      ) : candidate.statTrak ? (
                        <TileBadge>ST™</TileBadge>
                      ) : (
                        <span />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
