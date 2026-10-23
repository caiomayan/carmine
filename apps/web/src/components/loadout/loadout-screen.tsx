'use client';

import type { LoadoutSide } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/animate-ui/components/radix/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/animate-ui/components/radix/tabs';
import { PageHead } from '@/components/page-head';
import {
  type BoardColumn,
  type BoardColumnId,
  buildBoard,
  columnStartKey,
  type Direction,
  defaultSelection,
  equippedSidesOf,
  moveInBoard,
  otherSideOf,
  slotNameOfKey,
} from '@/lib/loadout/board';
import type { CandidateView, LoadoutView, SlotView } from '@/lib/loadout/view';
import { sidesLabelKey } from '@/lib/team-sides';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { BoardCard } from './board-card';
import { SlotDock } from './slot-dock';
import { SlotPicker } from './slot-picker';
import { useLastSide } from './use-last-side';

/** TR à esquerda, CT à direita, sempre. */
const SIDES = ['t', 'ct'] as const;
/** Mesmo corte do `lg` do Tailwind: abaixo dele, as cinco colunas viram uma por vez. */
const WIDE = '(min-width: 1001px)';

const GEAR_SLOTS = new Set(['knife', 'gloves', 'agent', 'musicKit']);
const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * A tela do Loadout (S05) no desenho do menu de compra do CS2: a troca TR | CT no alto, uma
 * coluna por categoria com todas as armas (e, na última, faca, luvas, agente e kit de música), o
 * slot selecionado numa barra fixa embaixo e, para trocar o Item, uma folha com o Inventário.
 * `notices` (avisos da Conta) fica entre o título e o quadro; `hand` (a mão de Presets) vem logo
 * antes da troca de lado, e a carta mostra o lado em uso. O lado em que abre é o último usado (CT se não houver nenhum).
 *
 * Abaixo de 1001 px mostra uma coluna por vez, escolhida numa fileira de categorias. O teclado
 * anda pelo quadro com as setas e 1 a 5 pulam de coluna (só com o foco num cartão).
 */
export function LoadoutScreen({
  view,
  candidates,
  rarityLabels,
  subtitle,
  notices,
  hand,
}: {
  view: LoadoutView;
  candidates: CandidateView[];
  rarityLabels: Record<string, string>;
  subtitle: ReactNode;
  notices?: ReactNode;
  /** A mão de Presets (cartas), antes da barra de cima. */
  hand?: ReactNode;
}) {
  const t = useTranslations('loadout');
  const tc = useTranslations('common');
  const wide = useMediaQuery(WIDE);
  const [side, setSide] = useLastSide();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [chosenColumn, setChosenColumn] = useState<BoardColumnId | null>(null);
  const [picker, setPicker] = useState<'closed' | 'right' | 'bottom'>('closed');
  const [flash, setFlash] = useState(0);
  const focusKey = useRef<string | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const barInnerRef = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => buildBoard(view.slots, side), [view.slots, side]);
  const allSlots = useMemo(() => columns.flatMap((column) => column.slots), [columns]);
  const names = useMemo(() => {
    const map = new Map(candidates.map((candidate) => [candidate.uid, candidate.name]));
    return (uid: string) => map.get(uid);
  }, [candidates]);

  const selected: SlotView | undefined =
    allSlots.find((slot) => slot.key === selectedKey) ??
    // Trocar de lado mantém o mesmo slot, se ele existe do outro lado.
    allSlots.find((slot) => slot.slot === slotNameOfKey(view.slots, selectedKey)) ??
    allSlots.find((slot) => slot.key === defaultSelection(columns));
  const columnOfSelected = columns.find((column) =>
    column.slots.some((slot) => slot.key === selected?.key),
  )?.id;
  // Abaixo de 1001 px, a coluna à vista é a escolhida na fileira ou, antes disso, a do selecionado.
  const activeColumn = chosenColumn ?? columnOfSelected ?? 'secondary';
  const tabStopKey =
    wide || columnOfSelected === activeColumn
      ? selected?.key
      : columns.find((column) => column.id === activeColumn)?.slots[0]?.key;

  // Leva o foco ao cartão para onde a seta ou o número foi (a coluna pode ter acabado de aparecer).
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda a cada seleção ou troca de coluna.
  useEffect(() => {
    const key = focusKey.current;
    if (!key) return;
    focusKey.current = null;
    focusCard(key);
  }, [selectedKey, activeColumn]);

  // A barra de baixo avisa a altura dela, para o aviso de "Desfazer" subir acima dela e para o
  // foco do teclado (e o scrollIntoView) trazer o cartão para cima dela (scroll-padding-bottom).
  // A de cima, que fica fixa no alto, faz o mesmo para o lado de cima (--space-scroll).
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const root = document.documentElement;
    // Na tela larga a barra fixa é a de fora; no celular, o grupo de dentro.
    const sticky = () =>
      [barRef.current, barInnerRef.current].find(
        (element) => element && getComputedStyle(element).position === 'sticky',
      );
    const measure = () => {
      root.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
      root.style.setProperty('--space-scroll', `${(sticky()?.offsetHeight ?? 0) + 8}px`);
    };
    const observer = new ResizeObserver(measure);
    for (const element of [dock, barRef.current, barInnerRef.current]) {
      if (element) observer.observe(element);
    }
    measure();
    return () => {
      observer.disconnect();
      root.style.removeProperty('--dock-h');
      root.style.removeProperty('--space-scroll');
    };
  }, []);

  const titleOf = (slot: SlotView) =>
    GEAR_SLOTS.has(slot.slot)
      ? t(`slots.${slot.slot as 'knife' | 'gloves' | 'agent' | 'musicKit'}`)
      : (slot.defaultName ?? slot.slot);

  function labelsOf(slot: SlotView) {
    const { item } = slot;
    const title = titleOf(slot);
    const sides = equippedSidesOf(view.slots, slot);
    const outOfGame = !!slot.notInGame || slot.strippedInGame.length > 0;
    const hasModel = slot.slot === 'knife' || slot.slot === 'gloves';
    const weapon = slot.slot.startsWith('weapon_') || hasModel;
    return {
      // No canto, o que é: a arma (na faca e nas luvas, o modelo, que a skin não repete).
      name: item && hasModel ? item.title : title,
      skin: item ? (weapon ? (item.subtitle ?? item.title) : item.title) : null,
      accessible: item
        ? [
            t('board.cardEquipped', {
              slot: title,
              item: item.name,
              sides: t(`sidesShort.${sidesLabelKey(sides)}`),
            }),
            outOfGame ? t('board.cardOutOfGame') : '',
          ]
            .filter(Boolean)
            .join(' ')
        : t('board.cardEmpty', {
            slot: title,
            default: slot.group === 'gear' ? t('defaultGear') : t('defaultWeapon'),
          }),
    };
  }

  function select(key: string, { focus = false } = {}) {
    const column = columns.find((candidate) => candidate.slots.some((slot) => slot.key === key));
    // Sem mudança de estado não há nova renderização, e o efeito acima nunca limparia o pedido
    // de foco: ele sobraria para o próximo clique. Então o foco vai direto.
    const unchanged = key === selectedKey && (!column || column.id === chosenColumn);
    if (focus && unchanged) focusCard(key);
    else if (focus) focusKey.current = key;
    setSelectedKey(key);
    if (column) setChosenColumn(column.id);
  }

  function onBoardKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card]');
    if (!card?.dataset.key || event.metaKey || event.ctrlKey || event.altKey) return;
    // Abaixo de 1001 px só uma coluna está à vista: as setas ficam nela.
    const visible: BoardColumn[] = wide
      ? columns
      : columns.filter((column) => column.id === activeColumn);
    const direction = ARROWS[event.key];
    const next = direction
      ? moveInBoard(visible, card.dataset.key, direction)
      : /^[1-5]$/.test(event.key)
        ? columnStartKey(columns, Number(event.key))
        : null;
    if (!next) return;
    event.preventDefault();
    if (next !== card.dataset.key || !direction) select(next, { focus: true });
  }

  function openPicker() {
    setPicker(wide ? 'right' : 'bottom');
  }

  const pickerOther = selected ? otherSideOf(view.slots, selected) : null;
  const equippedSides = selected ? equippedSidesOf(view.slots, selected) : [];
  const equippedCandidate =
    selected?.item && candidates.find((candidate) => candidate.uid === selected.item?.uid);
  // "Equipar também no outro lado": o slot existe lá, o Item cabe lá e ainda não está.
  const alsoSide =
    selected?.side && pickerOther && !equippedSides.includes(pickerOther)
      ? equippedCandidate?.sides?.includes(pickerOther)
        ? pickerOther
        : null
      : null;

  return (
    <Tabs value={side} onValueChange={(value) => setSide(value as LoadoutSide)} className="gap-0">
      <PageHead title={t('title')} subtitle={subtitle} />
      {notices}

      {hand ? <div className="mb-2 min-w-0">{hand}</div> : null}

      {/*
        A barra de cima: a troca TR | CT (e, abaixo de 1001 px, as categorias). Rola com a página
        até o alto e fica fixa. No celular só a troca de lado e as categorias ficam fixas
        (`contents` desfaz a barra e `sticky` fica no grupo de dentro).
      */}
      <div
        ref={barRef}
        className="max-md:contents md:sticky md:top-0 md:z-20 md:-mx-1 md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-1 md:bg-background md:px-1 md:pt-2 md:pb-2.5"
      >
        <div
          ref={barInnerRef}
          className="max-md:sticky max-md:top-0 max-md:z-20 max-md:-mx-1 max-md:bg-background max-md:px-1 max-md:pt-2 max-md:pb-2.5 md:contents"
        >
          <div className="md:order-1">
            <TabsList
              aria-label={t('sidesLabel')}
              className="max-md:w-full max-md:[&>*]:flex-1 rounded-lg bg-surface p-[3px]"
            >
              {SIDES.map((s) => (
                <TabsTrigger
                  key={s}
                  value={s}
                  data-testid={`side-${s}`}
                  className="min-w-24 gap-2.5"
                >
                  <span
                    aria-hidden="true"
                    className={cn('size-2.5 rounded-full', s === 't' ? 'bg-side-t' : 'bg-side-ct')}
                  />
                  {t(`sidesShort.${s}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <nav
            aria-label={t('board.categories')}
            className="mt-2 flex gap-0.5 overflow-x-auto max-md:pr-5 max-md:[mask-image:linear-gradient(to_right,black_calc(100%-1.25rem),transparent)] [scrollbar-width:none] md:order-3 md:basis-full md:mt-0 lg:hidden [&::-webkit-scrollbar]:hidden"
          >
            {columns.map((column) => (
              <button
                key={column.id}
                type="button"
                aria-pressed={column.id === activeColumn}
                onClick={() => setChosenColumn(column.id)}
                data-testid={`category-${column.id}`}
                className="flex min-h-(--tap) flex-none items-center gap-2 rounded-md px-3.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground aria-pressed:bg-hover aria-pressed:text-foreground"
              >
                {t(`groups.${column.id}`)}
                <span className="text-caption font-medium text-muted-foreground">
                  {column.slots.length}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      <TabsContent
        value={side}
        data-testid={`loadout-${side}`}
        onKeyDown={onBoardKeyDown}
        className="grid grid-cols-5 items-start gap-3 rounded-2xl bg-surface p-3.5 max-lg:block max-lg:p-3"
      >
        {columns.map((column, columnIndex) => {
          const id = `coluna-${side}-${column.id}`;
          return (
            <section
              key={column.id}
              aria-labelledby={id}
              data-testid={`column-${column.id}`}
              className={cn(
                'grid min-w-0 content-start gap-2',
                'max-md:grid-cols-2 md:max-lg:grid-cols-[repeat(auto-fill,minmax(168px,1fr))]',
                column.id !== activeColumn && 'max-lg:hidden',
              )}
            >
              <div className="grid grid-cols-[1fr_auto_1fr] items-baseline px-1 pb-1.5 max-lg:sr-only">
                <span aria-hidden="true" className="text-[11px] text-muted-foreground">
                  {columnIndex + 1}
                </span>
                <h2 id={id} className="text-center text-base font-[650]">
                  {t(`groups.${column.id}`)}
                </h2>
                <span
                  role="img"
                  aria-label={t('board.columnCount', {
                    equipped: column.equipped,
                    total: column.slots.length,
                  })}
                  className="justify-self-end text-[11px] text-muted-foreground"
                >
                  {column.equipped}/{column.slots.length}
                </span>
              </div>
              {column.slots.map((slot, index) => (
                <BoardCard
                  key={slot.key}
                  slot={slot}
                  number={index + 1}
                  index={index}
                  sides={equippedSidesOf(view.slots, slot)}
                  labels={labelsOf(slot)}
                  selected={slot.key === selected?.key}
                  tabStop={slot.key === tabStopKey}
                  onSelect={() => select(slot.key)}
                />
              ))}
            </section>
          );
        })}
      </TabsContent>

      <div
        ref={dockRef}
        className="pointer-events-none sticky bottom-0 z-30 pt-3.5 pb-[max(14px,env(safe-area-inset-bottom))]"
      >
        {selected ? (
          <div className="pointer-events-auto">
            <SlotDock
              slot={selected}
              title={titleOf(selected)}
              sides={equippedSides}
              otherSide={alsoSide}
              equippedCandidate={equippedCandidate || null}
              rarityLabel={selected.item ? (rarityLabels[selected.item.rarity] ?? '') : ''}
              readOnly={view.readOnly}
              flash={flash}
              names={names}
              onPick={openPicker}
              onChanged={() => setFlash((n) => n + 1)}
            />
          </div>
        ) : null}
      </div>

      <Sheet open={picker !== 'closed'} onOpenChange={(open) => !open && setPicker('closed')}>
        <SheetContent
          side={picker === 'bottom' ? 'bottom' : 'right'}
          closeLabel={tc('close')}
          className={cn(
            'overflow-y-auto',
            picker === 'bottom'
              ? 'h-auto max-h-[88dvh] rounded-t-xl pb-[max(20px,env(safe-area-inset-bottom))]'
              : 'w-[min(420px,100%-48px)]',
          )}
        >
          {selected ? (
            <>
              <SheetHeader className="pr-14">
                <SheetTitle>
                  {t('panel.pickerTitle', {
                    slot: selected.side
                      ? `${titleOf(selected)} · ${t(`sidesShort.${selected.side}`)}`
                      : titleOf(selected),
                  })}
                </SheetTitle>
                <SheetDescription>{t('panel.pickerDescription')}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <SlotPicker
                  key={selected.key}
                  slot={selected}
                  otherSide={pickerOther}
                  equippedSides={equippedSides}
                  candidates={candidates.filter(
                    (candidate) =>
                      candidate.slot === selected.slot &&
                      (candidate.sides === null ||
                        (selected.side !== null && candidate.sides.includes(selected.side))),
                  )}
                  catalogHref={catalogHref(selected)}
                  rarityLabels={rarityLabels}
                  names={names}
                  onDone={() => {
                    setPicker('closed');
                    setFlash((n) => n + 1);
                  }}
                />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </Tabs>
  );
}

/** Leva o foco do teclado ao cartão desta chave. */
function focusCard(key: string): void {
  for (const card of document.querySelectorAll<HTMLElement>('[data-card]')) {
    if (card.dataset.key === key) card.focus();
  }
}

/** O catálogo já filtrado para o slot: a arma, ou o tipo (faca, luvas, agente, kit de música). */
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
