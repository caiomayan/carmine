'use client';

import type { LoadoutSide } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/animate-ui/components/radix/sheet';
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from '@/components/animate-ui/components/radix/tabs';
import { PageHead } from '@/components/page-head';
import { SectionTitle } from '@/components/section-title';
import {
  type CandidateView,
  type LoadoutView,
  SLOT_VIEW_GROUPS,
  type SlotView,
} from '@/lib/loadout/view';
import { SlotPanel } from './slot-panel';
import { SlotTile } from './slot-tile';

const SIDES = ['ct', 't'] as const;
/** Mesmo corte do `lg` do Tailwind: abaixo dele, o painel vira uma folha de baixo. */
const WIDE = '(min-width: 1001px)';

const GEAR_SLOTS = new Set(['knife', 'gloves', 'agent', 'musicKit']);

/**
 * A tela do Loadout (S05): abas CT/TR, os slots agrupados como no jogo e, ao lado, o painel do
 * slot selecionado (no celular, numa folha que sobe). `header` fica entre o título e os slots
 * (avisos do VIP e Presets), `footer` depois deles.
 */
export function LoadoutScreen({
  view,
  candidates,
  rarityLabels,
  subtitle,
  notices,
}: {
  view: LoadoutView;
  candidates: CandidateView[];
  rarityLabels: Record<string, string>;
  subtitle: ReactNode;
  notices?: ReactNode;
}) {
  const t = useTranslations('loadout');
  const tc = useTranslations('common');
  const [side, setSide] = useState<LoadoutSide>('ct');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const bySide = useMemo(
    () =>
      Object.fromEntries(
        SIDES.map((s) => [s, view.slots.filter((slot) => slot.side === s || slot.side === null)]),
      ) as Record<LoadoutSide, SlotView[]>,
    [view.slots],
  );
  const names = useMemo(() => {
    const map = new Map(candidates.map((candidate) => [candidate.uid, candidate.name]));
    return (uid: string) => map.get(uid);
  }, [candidates]);

  const slots = bySide[side];
  const selected =
    slots.find((slot) => slot.key === selectedKey) ??
    // Trocar de lado mantém o mesmo slot, se ele existe do outro lado.
    slots.find((slot) => slot.slot === selectedKey?.split(':')[0]) ??
    slots.find((slot) => slot.slot === 'knife') ??
    slots[0];

  const titleOf = (slot: SlotView) =>
    GEAR_SLOTS.has(slot.slot)
      ? t(`slots.${slot.slot as 'knife' | 'gloves' | 'agent' | 'musicKit'}`)
      : (slot.defaultName ?? slot.slot);

  function select(slot: SlotView) {
    setSelectedKey(slot.key);
    if (!window.matchMedia(WIDE).matches) setSheetOpen(true);
  }

  const panel = selected ? (
    <SlotPanel
      key={selected.key}
      slot={selected}
      title={titleOf(selected)}
      sideName={selected.side ? t(`sides.${selected.side}`) : null}
      otherSide={otherSideOf(selected, view.slots)}
      candidates={candidates.filter(
        (candidate) =>
          candidate.slot === selected.slot &&
          (candidate.sides === null ||
            (selected.side !== null && candidate.sides.includes(selected.side))),
      )}
      readOnly={view.readOnly}
      catalogHref={catalogHref(selected)}
      rarityLabels={rarityLabels}
      names={names}
      onEquipped={() => setFlash(selected.key)}
    />
  ) : null;

  return (
    <Tabs value={side} onValueChange={(value) => setSide(value as LoadoutSide)} className="gap-0">
      <PageHead
        title={t('title')}
        subtitle={subtitle}
        aside={
          <TabsList aria-label={t('sidesLabel')} className="max-md:w-full">
            {SIDES.map((s) => (
              <TabsTrigger key={s} value={s} data-testid={`side-${s}`}>
                {t(`sides.${s}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        }
      />
      {notices}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(300px,340px)] items-start gap-8 pt-2 max-lg:grid-cols-1">
        <TabsContents>
          {SIDES.map((s) => (
            <TabsContent
              key={s}
              value={s}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="grid gap-7"
              data-testid={`loadout-${s}`}
            >
              {SLOT_VIEW_GROUPS.map((group) => {
                const groupSlots = bySide[s].filter((slot) => slot.group === group);
                if (groupSlots.length === 0) return null;
                const id = `grupo-${s}-${group}`;
                return (
                  <section key={group} aria-labelledby={id}>
                    <SectionTitle id={id}>{t(`groups.${group}`)}</SectionTitle>
                    <ul className="grid grid-cols-4 gap-2.5 max-xl:grid-cols-3 max-lg:grid-cols-4 max-md:grid-cols-2">
                      {groupSlots.map((slot, index) => (
                        <li key={slot.key} className="grid">
                          <SlotTile
                            slot={slot}
                            index={index}
                            selected={slot.key === selected?.key}
                            highlighted={slot.key === flash}
                            onSelect={() => select(slot)}
                            labels={{
                              slotName: GEAR_SLOTS.has(slot.slot) ? titleOf(slot) : null,
                              defaultLine:
                                slot.group === 'gear' ? t('defaultGear') : t('defaultWeapon'),
                              defaultTitle:
                                slot.slot === 'agent' ? t('defaultAgent') : t('defaultGear'),
                              rarity: slot.item ? (rarityLabels[slot.item.rarity] ?? '') : '',
                              notInGame: slot.notInGame
                                ? t('notInGame.short')
                                : t('stripped.short'),
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </TabsContent>
          ))}
        </TabsContents>

        <aside
          aria-label={t('panel.label')}
          className="sticky top-[calc(var(--hdr-h)+20px)] max-lg:hidden"
        >
          {panel}
        </aside>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          closeLabel={tc('close')}
          className="h-auto max-h-[88dvh] overflow-y-auto rounded-t-xl px-4 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] lg:hidden"
        >
          <SheetTitle className="sr-only">{t('panel.label')}</SheetTitle>
          <SheetDescription className="sr-only">
            {selected ? titleOf(selected) : ''}
          </SheetDescription>
          {sheetOpen ? panel : null}
        </SheetContent>
      </Sheet>
    </Tabs>
  );
}

/** O outro lado, quando o slot também existe nele (a AWP existe nos dois; a AK, só no TR). */
function otherSideOf(slot: SlotView, all: SlotView[]): LoadoutSide | null {
  if (!slot.side) return null;
  const other: LoadoutSide = slot.side === 'ct' ? 't' : 'ct';
  return all.some((candidate) => candidate.slot === slot.slot && candidate.side === other)
    ? other
    : null;
}

/** O catálogo já filtrado para o slot: a arma, ou o tipo (faca, luvas, agente, music kit). */
function catalogHref(slot: SlotView): string {
  const type: Record<string, string> = {
    knife: 'knife',
    gloves: 'glove',
    agent: 'agent',
    musicKit: 'musickit',
  };
  const params = new URLSearchParams(
    type[slot.slot]
      ? { tipo: type[slot.slot] as string }
      : { tipo: 'weapon', ...(slot.defaultName ? { arma: slot.defaultName } : {}) },
  );
  return `/inventario/adicionar?${params}`;
}
