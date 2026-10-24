'use client';

import type { LoadoutSide } from '@carmine/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CheckIcon } from '@/components/icons/animated/check';
import { PlusIcon } from '@/components/icons/animated/plus';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { ItemArt, RarityDot, TileBadge } from '@/components/inventory/item-tile';
import { TeamDots } from '@/components/team-dots';
import { Button } from '@/components/ui/button';
import type { CandidateView, SlotView } from '@/lib/loadout/view';
import { cn } from '@/lib/utils';
import { LoadoutApiError, useEquip } from './use-equip';

/**
 * O seletor de Itens de um slot (S05), na folha que o botão da barra de baixo abre: os Itens do
 * Inventário que cabem ali. Equipar escolhe o lado (este ou os dois); equipar sobre outro Item o
 * substitui, com o "Desfazer" no aviso. Ao equipar, a folha fecha (`onDone`).
 */
export function SlotPicker({
  slot,
  otherSide,
  equippedSides,
  candidates,
  catalogHref,
  rarityLabels,
  names,
  onDone,
}: {
  slot: SlotView;
  /** O outro lado, se o slot também existe nele. */
  otherSide: LoadoutSide | null;
  /** Os lados em que o Item atual do slot está equipado (as bolinhas na linha dele). */
  equippedSides: LoadoutSide[];
  candidates: CandidateView[];
  catalogHref: string;
  rarityLabels: Record<string, string>;
  names: (uid: string) => string | undefined;
  onDone: (uid: string) => void;
}) {
  const t = useTranslations('loadout');
  const { equip } = useEquip();
  const [bothSides, setBothSides] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { item } = slot;

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
      onDone(candidate.uid);
    } catch (caught) {
      const code = caught instanceof LoadoutApiError ? caught.code : 'network';
      if (code !== 'session')
        setError(code === 'unexpected' ? t('notices.failed') : t(`errors.${code}`));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-4" data-testid="slot-picker" data-slot-key={slot.key}>
      {error ? (
        <p role="alert" className="flex items-start gap-2 text-sm" data-testid="panel-error">
          <span
            aria-hidden="true"
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
          />
          {error}
        </p>
      ) : null}

      <section aria-labelledby={`${slot.key}-choose`} className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h3 id={`${slot.key}-choose`} className="label-caps text-foreground">
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
              className="-mr-2 gap-2 text-sm aria-pressed:bg-hover aria-pressed:text-foreground"
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
          <div className="grid justify-items-start gap-3 rounded-lg bg-surface px-4 py-4 text-sm">
            <p className="text-muted-foreground">{t('panel.none')}</p>
            <Button asChild variant="ghost" size="sm">
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
                      'grid min-h-(--tap) w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-md p-1.5 pr-3 text-left',
                      'transition-colors duration-(--dur-fast) ease-std hover:bg-hover disabled:hover:bg-transparent',
                      current && 'bg-surface',
                      pending === candidate.uid && 'animate-pulse motion-reduce:animate-none',
                    )}
                  >
                    <span className="block overflow-hidden rounded-sm bg-surface-2/60">
                      <ItemArt src={candidate.image} />
                    </span>
                    <span className="grid min-w-0 gap-0.5">
                      <span className="truncate text-sm font-semibold">{candidate.title}</span>
                      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
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
                      <TeamDots sides={equippedSides} />
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
    </div>
  );
}
