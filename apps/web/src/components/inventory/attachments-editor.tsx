'use client';

import { AnimatePresence, m } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { DeleteIcon } from '@/components/icons/animated/delete';
import { PlusIcon } from '@/components/icons/animated/plus';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/ui/select';
import type { ItemSpec } from '@/lib/catalog/catalog';
import { formatDecimal } from '@/lib/decimal';
import {
  CHARM_SLOTS,
  type CharmBounds,
  charmPlacement,
  charmSlotPosition,
  middle,
} from '@/lib/inventory/charm-slots';
import {
  type AttachmentLabel,
  type CharmForm,
  type FormIssue,
  MAX_STICKERS,
  type StickerForm,
} from '@/lib/inventory/item-form';
import { useRevealMotion } from '@/lib/use-reveal-motion';
import { cn } from '@/lib/utils';
import type { DragAction } from '@/lib/viewer/drag-selection';

// O seletor (diálogo, busca) só baixa quando a pessoa abre: não pesa na primeira carga do editor.
const AttachmentPicker = dynamic(
  () => import('./attachment-picker').then((m) => m.AttachmentPicker),
  {
    ssr: false,
  },
);

import { DecimalInput, describedBy, FieldShell, RangeInput } from './editor-fields';

type Bounds = { min: number | undefined; max: number | undefined };

/** Até 5 stickers: cada um com posição na arma, rotação, desgaste e ajuste fino opcional. */
export function StickersEditor({
  stickers,
  slots,
  offset,
  issues,
  errorText,
  onChange,
  drag,
}: {
  stickers: StickerForm[];
  slots: number;
  offset: ItemSpec['stickerOffset'];
  issues: FormIssue[];
  errorText: (issue: FormIssue) => string;
  onChange: (stickers: StickerForm[]) => void;
  drag: DragBinding;
}) {
  const t = useTranslations('itemEditor');
  const reveal = useRevealMotion();
  const [picking, setPicking] = useState(false);
  const full = stickers.length >= MAX_STICKERS;

  function add(label: AttachmentLabel) {
    const used = new Set(stickers.map((s) => s.schema));
    const free = Array.from({ length: slots }, (_, i) => i).find((i) => !used.has(i)) ?? 0;
    onChange([...stickers, { ...label, schema: free, rotation: 0, wear: 0 }]);
    drag.dispatch({ type: 'sticker-added', index: stickers.length });
  }

  const update = (index: number, patch: Partial<StickerForm>) =>
    onChange(stickers.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <section aria-labelledby="stickers-title" className="grid gap-3" data-drag-block>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="stickers-title" className="label-caps text-[11px]">
          {t('stickers')}
        </h3>
        <span className="text-[12.5px] text-muted-foreground tabular-nums">
          {t('stickersCount', { count: stickers.length, max: MAX_STICKERS })}
        </span>
      </div>

      <ol className="grid">
        <AnimatePresence initial={false}>
          {stickers.map((sticker, index) => (
            <m.li
              // biome-ignore lint/suspicious/noArrayIndexKey: a ordem é a identidade do sticker (chave "0".."4" do contrato).
              key={`${index}-${sticker.id}`}
              {...reveal}
              className="overflow-hidden"
            >
              <StickerRow
                index={index}
                sticker={sticker}
                slots={slots}
                offset={offset}
                issue={issues.find((issue) => issue.field.startsWith(`stickers.${index}.`))}
                errorText={errorText}
                onChange={(patch) => update(index, patch)}
                onRemove={() => {
                  drag.dispatch({ type: 'sticker-removed', index });
                  onChange(stickers.filter((_, i) => i !== index));
                }}
                selected={drag.selected?.kind === 'sticker' && drag.selected.index === index}
                onSelect={() => drag.dispatch({ type: 'focus-sticker', index })}
              />
            </m.li>
          ))}
        </AnimatePresence>
      </ol>

      <Button
        type="button"
        variant="ghost"
        className="justify-self-start bg-surface-2/60"
        disabled={full}
        onClick={() => setPicking(true)}
        data-testid="add-sticker"
      >
        <AnimatedIcon icon={PlusIcon} size={15} />
        {t('addSticker')}
      </Button>
      {picking ? (
        <AttachmentPicker type="sticker" open onOpenChange={setPicking} onPick={add} />
      ) : null}
    </section>
  );
}

function StickerRow({
  index,
  sticker,
  slots,
  offset,
  issue,
  errorText,
  onChange,
  onRemove,
  selected,
  onSelect,
}: {
  index: number;
  sticker: StickerForm;
  slots: number;
  offset: ItemSpec['stickerOffset'];
  issue: FormIssue | undefined;
  errorText: (issue: FormIssue) => string;
  onChange: (patch: Partial<StickerForm>) => void;
  onRemove: () => void;
  /** O 3D deixa arrastar este sticker agora (a seleção segue o foco da linha). */
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('itemEditor');
  const slotId = useId();
  const name = sticker.name.replace(/^Adesivo \| /, '');
  const error = issue ? errorText(issue) : undefined;
  return (
    <fieldset
      className="mb-2 grid gap-3 rounded-lg bg-surface-2/50 p-3 transition-[box-shadow,background-color] duration-(--dur-base) ease-std data-selected:bg-surface-2 data-selected:shadow-[inset_0_0_0_1px_var(--line-strong)]"
      data-testid={`sticker-${index}`}
      data-selected={selected || undefined}
      onFocus={onSelect}
    >
      <legend className="sr-only">{t('stickerLabel', { n: index + 1, name: sticker.name })}</legend>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-2">
          {sticker.image ? (
            // biome-ignore lint/performance/noImgElement: CDN da cs2-lib.
            <img src={sticker.image} alt="" width={40} height={30} className="w-9 object-contain" />
          ) : null}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium" title={sticker.name}>
          {name}
        </span>
        {selected ? <OnViewerTag testId={`on-viewer-sticker-${index}`} /> : null}
        <Button
          type="button"
          variant="quiet"
          size="icon"
          onClick={onRemove}
          aria-label={t('removeSticker', { name: sticker.name })}
        >
          <AnimatedIcon icon={DeleteIcon} size={16} />
        </Button>
      </div>

      <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_minmax(0,1fr)] gap-3 max-md:grid-cols-1">
        <FieldShell id={slotId} label={t('slot')} error={error}>
          <SimpleSelect
            id={slotId}
            value={String(sticker.schema)}
            onValueChange={(next) => onChange({ schema: Number(next) })}
            aria-invalid={!!error || undefined}
            aria-describedby={describedBy(slotId, { error })}
            className="bg-surface-2 text-[14px] aria-invalid:shadow-[inset_0_0_0_1.5px_var(--status-danger)] hover:bg-line"
            options={Array.from({ length: slots }, (_, slot) => ({
              value: String(slot),
              label: t('slotN', { n: slot + 1 }),
            }))}
          />
        </FieldShell>
        <SliderField
          label={t('rotation')}
          value={sticker.rotation}
          display={t('rotationValue', { value: formatDecimal(sticker.rotation, 1) })}
          min={-180}
          max={180}
          step={0.5}
          onChange={(rotation) => onChange({ rotation })}
        />
        <SliderField
          label={t('stickerWear')}
          value={sticker.wear}
          display={`${Math.round(sticker.wear * 100)}%`}
          min={0}
          max={1}
          step={0.01}
          onChange={(wear) => onChange({ wear })}
        />
      </div>

      {offset && hasBounds(offset.x) && hasBounds(offset.y) ? (
        <FineAdjust>
          <div className="grid grid-cols-2 gap-3 pt-2 max-md:grid-cols-1">
            <OffsetSlider
              label={t('offsetX')}
              bounds={offset.x}
              value={sticker.x}
              onChange={(x) => onChange({ x })}
            />
            <OffsetSlider
              label={t('offsetY')}
              bounds={offset.y}
              value={sticker.y}
              onChange={(y) => onChange({ y })}
            />
          </div>
        </FineAdjust>
      ) : null}
    </fieldset>
  );
}

const hasBounds = (b: Bounds): b is { min: number; max: number } =>
  b.min !== undefined && b.max !== undefined;

function OffsetSlider({
  label,
  bounds,
  value,
  onChange,
}: {
  label: string;
  bounds: Bounds;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  if (!hasBounds(bounds)) return null;
  const current = value ?? (bounds.min + bounds.max) / 2;
  return (
    <SliderField
      label={label}
      value={current}
      display={formatDecimal(current, 3)}
      min={bounds.min}
      max={bounds.max}
      step={0.0001}
      onChange={onChange}
    />
  );
}

function SliderField({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid content-start gap-2">
      <div className="flex min-h-4 items-baseline justify-between gap-2">
        <span aria-hidden="true" className="label-caps text-[11px]">
          {label}
        </span>
        <span aria-hidden="true" className="text-[12.5px] font-semibold tabular-nums">
          {display}
        </span>
      </div>
      <div className="flex min-h-(--tap) items-center">
        <RangeInput
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={onChange}
          label={label}
          valueText={display}
        />
      </div>
    </div>
  );
}

/**
 * O que o editor liga ao 3D: a seleção que o viewer deixa arrastar agora (a linha com o foco) e
 * o despacho dos eventos que a movem (ver `lib/viewer/drag-selection.ts`).
 */
export type DragBinding = {
  selected: { kind: 'sticker' | 'keychain'; index: number } | null;
  dispatch: (action: DragAction) => void;
};

/** Marca discreta de que a linha está selecionada e o 3D deixa arrastá-la. */
function OnViewerTag({ testId }: { testId: string }) {
  const t = useTranslations('itemEditor');
  return (
    <span
      data-testid={testId}
      className="inline-flex shrink-0 animate-fade-up items-center gap-1.5 rounded-sm px-1.5 py-1 text-[11px] font-medium text-muted-foreground max-md:hidden"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
      </svg>
      {t('onViewer')}
    </span>
  );
}

/** "Ajuste fino": os controles de precisão ficam recolhidos; o teclado chega a todos. */
function FineAdjust({ children }: { children: React.ReactNode }) {
  const t = useTranslations('itemEditor');
  return (
    <details className="group/fine">
      <summary className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 -ml-2 text-[12.5px] font-medium text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-hover hover:text-foreground max-md:min-h-(--tap)">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-3.5 transition-[rotate] duration-(--dur-fast) ease-std motion-reduce:transition-none group-open/fine:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        {t('moreOptions')}
      </summary>
      <div className="group-open/fine:animate-fade-up">{children}</div>
    </details>
  );
}

const DEFAULT_PLACEMENT = 'default';
const CUSTOM_PLACEMENT = 'custom';

/**
 * O chaveiro: padrão (seed) e posição na arma, no mesmo modelo dos stickers: posições prontas
 * ao longo da arma (lista) e ajuste fino em X, Y e Z. Arrastar no 3D é só um atalho e leva à
 * posição "Personalizada". A seleção no 3D segue o foco da linha.
 */
export function CharmEditor({
  charm,
  spec,
  issue,
  errorText,
  onChange,
  drag,
}: {
  charm: CharmForm | null;
  spec: NonNullable<ItemSpec['charm']>;
  issue: FormIssue | undefined;
  errorText: (issue: FormIssue) => string;
  onChange: (charm: CharmForm | null) => void;
  drag: DragBinding;
}) {
  const t = useTranslations('itemEditor');
  const [picking, setPicking] = useState(false);
  const seedId = useId();
  const placementId = useId();
  const error = issue ? errorText(issue) : undefined;
  const { x, y, z } = spec.position;
  const bounds: CharmBounds | null =
    hasBounds(x) && hasBounds(y) && hasBounds(z) ? { x, y, z } : null;
  const placement = bounds && charm ? charmPlacement(bounds, charm) : null;
  const selected = drag.selected?.kind === 'keychain';

  function place(value: string) {
    // O Select do Radix também avisa com um valor vazio quando o valor controlado muda para uma
    // opção que ainda não montou (a "Personalizada"): só vale o que a lista oferece.
    const isSlot = /^\d+$/.test(value) && Number(value) < CHARM_SLOTS;
    if (!charm || !bounds || !(isSlot || value === DEFAULT_PLACEMENT)) return;
    if (value === DEFAULT_PLACEMENT) {
      onChange({ id: charm.id, name: charm.name, image: charm.image, seed: charm.seed });
      return;
    }
    onChange({ ...charm, ...charmSlotPosition(bounds, Number(value)) });
  }

  return (
    <section aria-labelledby="charm-title" className="grid gap-3" data-drag-block>
      <h3 id="charm-title" className="label-caps text-[11px]">
        {t('charm')}
      </h3>
      {charm ? (
        <fieldset
          className="grid gap-3 rounded-lg bg-surface-2/50 p-3 transition-[box-shadow,background-color] duration-(--dur-base) ease-std animate-fade-up data-selected:bg-surface-2 data-selected:shadow-[inset_0_0_0_1px_var(--line-strong)]"
          data-testid="charm"
          data-selected={selected || undefined}
          onFocus={() => drag.dispatch({ type: 'focus-charm' })}
        >
          <legend className="sr-only">{t('charmLabel', { name: charm.name })}</legend>
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-2">
              {charm.image ? (
                // biome-ignore lint/performance/noImgElement: CDN da cs2-lib.
                <img
                  src={charm.image}
                  alt=""
                  width={40}
                  height={30}
                  className="w-9 object-contain"
                />
              ) : null}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium" title={charm.name}>
              {charm.name.replace(/^Chaveiro \| /, '')}
            </span>
            {selected ? <OnViewerTag testId="on-viewer-charm" /> : null}
            <Button
              type="button"
              variant="quiet"
              size="icon"
              onClick={() => {
                drag.dispatch({ type: 'charm-removed' });
                onChange(null);
              }}
              aria-label={t('removeCharm', { name: charm.name })}
            >
              <AnimatedIcon icon={DeleteIcon} size={16} />
            </Button>
          </div>
          <div className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)] gap-3 max-md:grid-cols-1">
            <FieldShell
              id={seedId}
              label={t('charmSeed')}
              error={error}
              hint={t('seedRange', { min: spec.seed.min, max: formatDecimal(spec.seed.max, 0) })}
            >
              <DecimalInput
                id={seedId}
                value={charm.seed}
                decimals={0}
                invalid={!!error}
                describedBy={describedBy(seedId, { error, hint: true })}
                onChange={(seed) => onChange({ ...charm, seed: seed ?? Number.NaN })}
              />
            </FieldShell>
            {bounds && placement ? (
              <FieldShell id={placementId} label={t('charmPosition')}>
                <SimpleSelect
                  id={placementId}
                  value={
                    placement.kind === 'slot'
                      ? String(placement.slot)
                      : placement.kind === 'custom'
                        ? CUSTOM_PLACEMENT
                        : DEFAULT_PLACEMENT
                  }
                  onValueChange={place}
                  className="bg-surface-2 text-[14px] hover:bg-line"
                  data-testid="charm-placement"
                  options={[
                    { value: DEFAULT_PLACEMENT, label: t('positionDefault') },
                    ...Array.from({ length: CHARM_SLOTS }, (_, slot) => ({
                      value: String(slot),
                      label: t(
                        slot === 0
                          ? 'charmSlotFirst'
                          : slot === CHARM_SLOTS - 1
                            ? 'charmSlotLast'
                            : 'charmSlotN',
                        { n: slot + 1 },
                      ),
                    })),
                    ...(placement.kind === 'custom'
                      ? [{ value: CUSTOM_PLACEMENT, label: t('positionCustom') }]
                      : []),
                  ]}
                />
              </FieldShell>
            ) : null}
          </div>
          {bounds && placement ? (
            <FineAdjust>
              {placement.kind === 'default' ? (
                <p className="pt-2 text-[12.5px] text-muted-foreground">{t('charmFineHint')}</p>
              ) : (
                <div className="grid grid-cols-3 gap-3 pt-2 max-md:grid-cols-1">
                  {(['x', 'y', 'z'] as const).map((axis) => {
                    const range = bounds[axis];
                    const value = charm[axis] ?? middle(range);
                    return (
                      <SliderField
                        key={axis}
                        label={t(`axis${axis.toUpperCase() as 'X' | 'Y' | 'Z'}`)}
                        value={value}
                        display={formatDecimal(value, 2)}
                        min={range.min}
                        max={range.max}
                        step={0.0001}
                        onChange={(next) =>
                          onChange({
                            ...charm,
                            x: charm.x ?? middle(bounds.x),
                            y: charm.y ?? middle(bounds.y),
                            z: charm.z ?? middle(bounds.z),
                            [axis]: next,
                          })
                        }
                      />
                    );
                  })}
                </div>
              )}
            </FineAdjust>
          ) : null}
        </fieldset>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className={cn('justify-self-start bg-surface-2/60')}
          onClick={() => setPicking(true)}
          data-testid="add-charm"
        >
          <AnimatedIcon icon={PlusIcon} size={15} />
          {t('addCharm')}
        </Button>
      )}
      {picking ? (
        <AttachmentPicker
          type="charm"
          open
          onOpenChange={setPicking}
          onPick={(label) => onChange({ ...label, seed: spec.seed.min })}
        />
      ) : null}
    </section>
  );
}
