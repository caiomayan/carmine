'use client';

import type { LoadoutSide, PresetList } from '@carmine/contracts';
import { PRESETS_VIP_LIMIT } from '@carmine/contracts/rules';
import { m, type PanInfo, useReducedMotion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/animate-ui/components/radix/dropdown-menu';
import { LockIcon } from '@/components/icons/animated/lock';
import { PlusIcon } from '@/components/icons/animated/plus';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { useInventory } from '@/components/inventory/inventory-provider';
import { ItemArt, RARITY_COLOR } from '@/components/inventory/item-tile';
import { Button } from '@/components/ui/button';
import { CARD, focusAt, HAND, type HandMode, handLayout, handMode } from '@/lib/loadout/hand';
import type { HandCard, HandPiece } from '@/lib/loadout/hand-view';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { DeleteDialog, Explanation, NameDialog } from './preset-dialogs';
import { useLastSide } from './use-last-side';
import { LoadoutApiError, useLoadoutApi } from './use-loadout-api';

/** Até onde (px) a carta é jogada para cima, e o quanto basta para valer como jogada. */
const PLAY_DRAG_LIMIT = 170;
const PLAY_DISTANCE = 72;
const PLAY_VELOCITY = 600;
/** Em cima, a carta em foco sobe por cima do que vier antes (nada recorta); embaixo, a mão é recortada. */
const PEEK_CLIP = 'inset(-160px -160px 0 -160px)';

type DialogState =
  | { kind: 'create' }
  | { kind: 'rename'; preset: HandCard }
  | { kind: 'delete'; preset: HandCard }
  | null;

/**
 * Os Presets do Loadout como uma mão de cartas (U3). Cada carta é um Preset: a faca, as luvas e o
 * rifle do lado em uso na frente, o nome e o lado. Passar o mouse folheia a mão; clicar, apertar
 * Enter ou jogar a carta para cima ativa o Preset (a mesma ação de antes, com "Desfazer"). As
 * setas folheiam; no celular (ou com muitas cartas para pouca largura) a mão é uma fileira que
 * rola e prende no centro. Sem sorteio nem aleatoriedade: a mão é a lista dos Presets, na ordem de
 * sempre. Plano grátis: uma carta só e o convite do VIP, discreto.
 */
export function PresetHand({
  list,
  cards,
  vip,
}: {
  list: PresetList;
  cards: HandCard[];
  vip: boolean;
}) {
  const t = useTranslations('loadout.presets');
  const tn = useTranslations('loadout.notices');
  const te = useTranslations('loadout.errors');
  const api = useLoadoutApi();
  const router = useRouter();
  const { notify, offerAction } = useInventory();
  const [side] = useLastSide();
  const reduced = useReducedMotion() ?? false;
  const coarse = useMediaQuery('(pointer: coarse)', false);

  const section = useRef<HTMLElement>(null);
  const hand = useRef<HTMLUListElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [width, setWidth] = useState(0);
  const [focused, setFocused] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dragging = useRef(false);

  const { limit } = list;
  const active = cards.find((card) => card.active);
  const main = cards.find((card) => card.main);
  const anyReadOnly = cards.some((card) => card.readOnly);
  const full = cards.length >= limit;
  const slots = cards.length + (vip ? 1 : 0);
  const activeIndex = cards.findIndex((card) => card.active);
  // Com explicação de somente leitura (sem VIP) ela vem num bloco; senão o aviso do plano vai na linha da contagem.
  const explained = anyReadOnly;
  const noteFree = !vip && !explained;
  const noteFull = vip && full && !explained;
  const [rovingAt, setRoving] = useState(Math.max(0, activeIndex));
  // Apagar a última carta não deixa a mão sem parada do Tab.
  const roving = Math.min(rovingAt, slots - 1);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const mode: HandMode = coarse ? 'row' : handMode(slots, width);
  const poses = useMemo(
    () =>
      handLayout({
        count: slots,
        width,
        focused,
        active: activeIndex >= 0 ? activeIndex : null,
        reduced,
      }),
    [slots, width, focused, activeIndex, reduced],
  );

  // Na fileira, a carta ativa vem para o meio quando ela aparece (a cada troca de modo).
  // biome-ignore lint/correctness/useExhaustiveDependencies: só a troca de modo recentraliza.
  useEffect(() => {
    if (mode !== 'row' || activeIndex < 0) return;
    const card = hand.current?.children[activeIndex] as HTMLElement | undefined;
    card?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [mode]);

  const message = (caught: unknown) => {
    const code = caught instanceof LoadoutApiError ? caught.code : 'network';
    return code === 'session' ? null : code === 'unexpected' ? te('network') : te(code);
  };

  async function activate(card: HandCard) {
    if (card.active || card.readOnly || pending !== null) return;
    const previous = active;
    setPending(card.id);
    setError(null);
    try {
      await api.activatePreset(card.id);
      const done = t('activated', { name: card.name });
      // O Preset anterior volta com o "Desfazer"; um somente leitura (sem VIP) não dá para reativar.
      if (previous && !previous.readOnly) {
        offerAction({
          message: done,
          failure: tn('undoFailed'),
          labels: { undo: tn('undo'), undoing: tn('undoing') },
          undo: async () => {
            await api.activatePreset(previous.id);
            router.refresh();
            return { message: t('activated', { name: previous.name }) };
          },
        });
      } else {
        notify(done);
      }
      router.refresh();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  const folhear = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (mode !== 'fan' || slots < 2 || event.pointerType !== 'mouse' || dragging.current) return;
      const rect = hand.current?.getBoundingClientRect();
      if (!rect) return;
      setFocused(focusAt(event.clientX - (rect.left + rect.width / 2), slots, width));
    },
    [mode, slots, width],
  );

  const indexOfButton = (target: EventTarget | null) =>
    (buttons.current as (EventTarget | null)[]).indexOf(target);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const index = indexOfButton(document.activeElement);
    if (index < 0) return;
    const target =
      event.key === 'ArrowRight'
        ? Math.min(index + 1, slots - 1)
        : event.key === 'ArrowLeft'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? slots - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    buttons.current[target]?.focus();
  }

  function onDragEnd(card: HandCard, info: PanInfo) {
    // O clique que o navegador solta depois do arrasto não conta como outra ativação.
    setTimeout(() => {
      dragging.current = false;
    }, 0);
    if (info.offset.y < -PLAY_DISTANCE || info.velocity.y < -PLAY_VELOCITY) void activate(card);
  }

  const fan = mode === 'fan';
  const sideLabel = (value: LoadoutSide) => t(`hand.side.${value}`);

  return (
    <section
      ref={section}
      aria-label={t('title')}
      className="relative z-10 grid min-w-0 gap-2"
      data-testid="presets"
      data-mode={mode}
    >
      <ul
        ref={hand}
        aria-label={t('label')}
        onPointerMove={folhear}
        onPointerLeave={() => {
          // O foco do teclado (ou o menu aberto) mantém a carta erguida; o de um clique não.
          const at = document.activeElement;
          const keyboard = !!at && hand.current?.contains(at) && at.matches(':focus-visible');
          if (!keyboard && !menuOpen) setFocused(null);
        }}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const index = indexOfButton(event.target);
          if (index >= 0) {
            setRoving(index);
            setFocused(index);
          }
        }}
        onBlur={(event) => {
          // O menu "…" abre num portal fora da mão: com ele aberto, a carta continua erguida.
          if (!menuOpen && !event.currentTarget.contains(event.relatedTarget)) setFocused(null);
        }}
        className={cn(
          'relative',
          fan
            ? 'mx-auto w-full'
            : 'flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pt-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
        style={fan ? { height: HAND.lift + HAND.peek, clipPath: PEEK_CLIP } : undefined}
      >
        {cards.map((card, index) => (
          <HandSlot
            key={card.id}
            index={index}
            fan={fan}
            pose={poses[index]}
            reduced={reduced}
            draggable={fan && !card.readOnly && !card.active && !coarse}
            onDragStart={() => {
              dragging.current = true;
            }}
            onDragEnd={(info) => onDragEnd(card, info)}
            testId="preset"
            data={{
              'data-active': card.active || undefined,
              'data-read-only': card.readOnly || undefined,
              'data-focused': focused === index || undefined,
            }}
          >
            <PresetFace
              card={card}
              side={side}
              sideLabel={sideLabel(side)}
              pending={pending === card.id}
              menu={!(card.main && !vip) && !card.readOnly}
              tabStop={roving === index}
              buttonRef={(element) => {
                buttons.current[index] = element;
              }}
              onActivate={() => {
                if (!dragging.current) void activate(card);
              }}
            />
            {card.main && !vip ? null : (
              <DropdownMenu onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger
                  aria-label={t('actions', { name: card.name })}
                  disabled={card.readOnly}
                  tabIndex={roving === index ? 0 : -1}
                  className="absolute top-1 right-1 grid h-(--tap) w-8 place-items-center rounded-md bg-surface-2 text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-(--dur-fast) ease-std group-focus-within/card:opacity-100 group-hover/card:opacity-100 hover:bg-(--fill-active) hover:text-foreground focus-visible:opacity-100 disabled:opacity-0 aria-expanded:bg-(--fill-active) aria-expanded:opacity-100 max-md:opacity-100 pointer-coarse:opacity-100"
                  data-testid="preset-menu"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="currentColor"
                  >
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-36">
                  <DropdownMenuItem
                    onSelect={() => setDialog({ kind: 'rename', preset: card })}
                    data-testid="preset-rename"
                  >
                    {t('rename')}
                  </DropdownMenuItem>
                  {card.main ? null : (
                    <DropdownMenuItem
                      onSelect={() => setDialog({ kind: 'delete', preset: card })}
                      data-testid="preset-delete"
                    >
                      {t('delete')}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </HandSlot>
        ))}

        {vip ? (
          <HandSlot
            index={cards.length}
            fan={fan}
            pose={poses[cards.length]}
            reduced={reduced}
            draggable={false}
            testId="preset-new-slot"
            data={{}}
          >
            <button
              type="button"
              ref={(element) => {
                buttons.current[cards.length] = element;
              }}
              onClick={() => {
                if (!full) setDialog({ kind: 'create' });
              }}
              aria-disabled={full || undefined}
              tabIndex={roving === cards.length ? 0 : -1}
              className={cn(
                'grid h-full w-full content-start justify-items-center gap-2 rounded-xl bg-(--fill-rest) px-3 pt-9 text-center text-body-sm font-[600] transition-colors duration-(--dur-fast) ease-std',
                full ? 'cursor-not-allowed opacity-50' : 'hover:bg-(--fill-hover)',
              )}
              data-testid="preset-new"
              data-icon-trigger
            >
              <span className="grid size-9 place-items-center rounded-full bg-surface-2">
                <AnimatedIcon icon={PlusIcon} size={16} />
              </span>
              {t('new')}
            </button>
          </HandSlot>
        ) : null}
      </ul>

      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-1 text-caption text-muted-foreground">
        <span className="tabular-nums" data-testid="preset-count">
          {t('count', { count: cards.length, limit })}
        </span>
        {cards.length > 1 && fan && !reduced ? <span>{t('hand.hint')}</span> : null}
        {noteFree ? (
          <span className="inline-flex max-w-[52ch] items-start gap-1.5" data-testid="preset-free">
            <AnimatedIcon icon={LockIcon} size={13} className="mt-0.5 shrink-0 text-status-vip" />
            {t('freeLimit', { limit: PRESETS_VIP_LIMIT })}
          </span>
        ) : null}
        {noteFull ? <span role="status">{t('limitReached', { limit })}</span> : null}
      </div>

      {error ? (
        <p role="alert" className="flex items-start justify-center gap-2 text-body-sm">
          <span
            aria-hidden="true"
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
          />
          {error}
        </p>
      ) : null}

      {explained ? (
        <div className="flex justify-center">
          {active?.readOnly && main ? (
            <Explanation testId="preset-active-read-only">
              <span className="flex-1">{t('activeReadOnly', { name: active.name })}</span>
              <Button
                variant="ghost"
                size="sm"
                className="-my-1"
                onClick={() => activate(main)}
                disabled={pending !== null}
                data-testid="activate-main"
              >
                {t('activateMain')}
              </Button>
            </Explanation>
          ) : (
            <Explanation testId="preset-read-only">{t('readOnlyBody')}</Explanation>
          )}
        </div>
      ) : null}

      {dialog?.kind === 'create' || dialog?.kind === 'rename' ? (
        <NameDialog
          preset={dialog.kind === 'rename' ? dialog.preset : null}
          onClose={() => setDialog(null)}
          errorOf={message}
        />
      ) : dialog?.kind === 'delete' ? (
        <DeleteDialog preset={dialog.preset} onClose={() => setDialog(null)} errorOf={message} />
      ) : null}
    </section>
  );
}

/**
 * Uma posição da mão. No leque, a carta é posicionada pelo Motion (mola) e pode ser jogada para
 * cima; na fileira, é um item que o scroll prende no centro. Com movimento reduzido o Motion
 * desliga os deslocamentos: a carta só troca de lugar na hora.
 */
function HandSlot({
  index,
  fan,
  pose,
  reduced,
  draggable,
  onDragStart,
  onDragEnd,
  testId,
  data,
  children,
}: {
  index: number;
  fan: boolean;
  pose: ReturnType<typeof handLayout>[number] | undefined;
  reduced: boolean;
  draggable: boolean;
  onDragStart?: () => void;
  onDragEnd?: (info: PanInfo) => void;
  testId: string;
  data: Record<string, true | undefined>;
  children: React.ReactNode;
}) {
  if (!fan || !pose) {
    return (
      <li
        className="group/card relative flex-none snap-center"
        style={{ width: CARD.width, height: CARD.height }}
        data-testid={testId}
        {...data}
      >
        {children}
      </li>
    );
  }
  return (
    <m.li
      className="group/card absolute"
      data-testid={testId}
      data-index={index}
      {...data}
      style={
        {
          left: '50%',
          top: HAND.lift,
          width: CARD.width,
          height: CARD.height,
          marginLeft: -CARD.width / 2,
          zIndex: pose.z,
          transformOrigin: '50% 100%',
        } as CSSProperties
      }
      initial={false}
      animate={{ x: pose.x, y: pose.y, rotate: pose.rotate, scale: pose.scale }}
      transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.7 }}
      drag={draggable && !reduced ? 'y' : false}
      dragSnapToOrigin
      dragElastic={0.15}
      dragConstraints={{ top: -PLAY_DRAG_LIMIT, bottom: 0 }}
      onDragStart={onDragStart}
      onDragEnd={(_, info) => onDragEnd?.(info)}
    >
      {children}
    </m.li>
  );
}

/** A frente da carta: nome, as três peças, o lado e o estado. */
function PresetFace({
  card,
  side,
  sideLabel,
  pending,
  menu,
  tabStop,
  buttonRef,
  onActivate,
}: {
  card: HandCard;
  side: LoadoutSide;
  sideLabel: string;
  pending: boolean;
  /** O menu "…" fica no canto de cima: o nome deixa o espaço dele. */
  menu: boolean;
  tabStop: boolean;
  buttonRef: (element: HTMLButtonElement | null) => void;
  onActivate: () => void;
}) {
  const t = useTranslations('loadout.presets');
  const front = card.front[side];
  const summaryId = `preset-${card.id}-summary`;
  const sideDot = side === 't' ? 'bg-side-t' : 'bg-side-ct';
  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onClick={onActivate}
        aria-pressed={card.active}
        aria-disabled={card.readOnly || undefined}
        aria-label={card.active ? undefined : t('activate', { name: card.name })}
        aria-describedby={summaryId}
        tabIndex={tabStop ? 0 : -1}
        className={cn(
          'grid h-full w-full grid-rows-[auto_1fr_auto_auto] gap-1.5 rounded-xl p-2.5 text-left shadow-[0_10px_24px_-14px_var(--shadow)] transition-colors duration-(--dur-fast) ease-std',
          card.active ? 'bg-surface-2' : 'bg-surface',
          card.readOnly
            ? 'cursor-not-allowed text-muted-foreground'
            : 'group-hover/card:bg-surface-2',
          pending && 'animate-pulse motion-reduce:animate-none',
        )}
        data-icon-trigger
      >
        <span
          className={cn(
            'flex min-w-0 items-start gap-1.5 text-caption leading-tight font-[650]',
            menu && 'pr-8',
          )}
        >
          {card.readOnly ? (
            <AnimatedIcon icon={LockIcon} size={12} className="mt-0.5 shrink-0 text-status-vip" />
          ) : null}
          {/* Até 2 linhas e depois reticências; o nome inteiro fica na dica e no nome do botão. */}
          <span
            className="line-clamp-2 min-w-0 break-words"
            title={card.name}
            data-testid="preset-title"
          >
            {card.name}
          </span>
        </span>
        <Piece piece={front.knife} className="h-full max-h-14" />
        <span className="grid grid-cols-2 gap-1.5">
          <Piece piece={front.gloves} className="h-9" />
          <Piece piece={front.rifle} className="h-9" />
        </span>
        <span className="flex items-center justify-between gap-1 text-caption text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('size-2 rounded-full', sideDot)} />
            {sideLabel}
          </span>
          {card.active ? (
            <span className="rounded-sm bg-(--fill-active) px-1.5 py-px label-caps text-label text-foreground">
              {t('hand.activeBadge')}
            </span>
          ) : (
            <span className="tabular-nums">{t('hand.items', { count: card.equippedCount })}</span>
          )}
        </span>
        {card.active ? <span className="sr-only">{t('active')}</span> : null}
      </button>
      <span id={summaryId} className="sr-only">
        {t('hand.summary', {
          knife: front.knife.name,
          gloves: front.gloves.name,
          rifle: front.rifle.name,
          count: card.equippedCount,
        })}
        {card.readOnly ? ` ${t('readOnly')}.` : null}
      </span>
    </>
  );
}

/** Uma peça da frente: o Item (com a faixa da raridade) ou a arma padrão apagada. */
function Piece({ piece, className }: { piece: HandPiece; className: string }) {
  return (
    <span
      className="relative grid min-h-0 place-items-center"
      style={piece.rarity ? ({ '--rc': RARITY_COLOR[piece.rarity] } as CSSProperties) : undefined}
    >
      <ItemArt
        src={piece.image}
        className={cn(
          // Sem arrasto nativo da imagem: ele cancelaria o gesto de jogar a carta para cima.
          'pointer-events-none aspect-auto w-full object-contain select-none',
          className,
          piece.uid === null && 'opacity-35 grayscale',
        )}
      />
      {piece.rarity ? (
        <i
          aria-hidden="true"
          className="absolute bottom-0 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-(--rc)"
        />
      ) : null}
    </span>
  );
}
