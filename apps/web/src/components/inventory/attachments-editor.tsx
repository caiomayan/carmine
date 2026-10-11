'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { DeleteIcon } from '@/components/icons/animated/delete';
import { PlusIcon } from '@/components/icons/animated/plus';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import type { ItemSpec } from '@/lib/catalog/catalog';
import { formatDecimal } from '@/lib/decimal';
import {
  type AttachmentLabel,
  type CharmForm,
  type FormIssue,
  MAX_STICKERS,
  type StickerForm,
} from '@/lib/inventory/item-form';
import { cn } from '@/lib/utils';
import { AttachmentPicker } from './attachment-picker';
import { DecimalInput, describedBy, FieldShell, RangeInput } from './editor-fields';

type Bounds = { min: number | undefined; max: number | undefined };

const listMotion = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const },
};

/** Até 5 stickers: cada um com posição na arma, rotação, desgaste e ajuste fino opcional. */
export function StickersEditor({
  stickers,
  slots,
  offset,
  issues,
  errorText,
  onChange,
}: {
  stickers: StickerForm[];
  slots: number;
  offset: ItemSpec['stickerOffset'];
  issues: FormIssue[];
  errorText: (issue: FormIssue) => string;
  onChange: (stickers: StickerForm[]) => void;
}) {
  const t = useTranslations('itemEditor');
  const [picking, setPicking] = useState(false);
  const full = stickers.length >= MAX_STICKERS;

  function add(label: AttachmentLabel) {
    const used = new Set(stickers.map((s) => s.schema));
    const free = Array.from({ length: slots }, (_, i) => i).find((i) => !used.has(i)) ?? 0;
    onChange([...stickers, { ...label, schema: free, rotation: 0, wear: 0 }]);
  }

  const update = (index: number, patch: Partial<StickerForm>) =>
    onChange(stickers.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <section aria-labelledby="stickers-title" className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="stickers-title" className="label-caps text-[10.5px]">
          {t('stickers')}
        </h3>
        <span className="text-[12.5px] text-muted-foreground tabular-nums">
          {t('stickersCount', { count: stickers.length, max: MAX_STICKERS })}
        </span>
      </div>

      <ol className="grid">
        <AnimatePresence initial={false}>
          {stickers.map((sticker, index) => (
            <motion.li
              // biome-ignore lint/suspicious/noArrayIndexKey: a ordem é a identidade do sticker (chave "0".."4" do contrato).
              key={`${index}-${sticker.id}`}
              {...listMotion}
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
                onRemove={() => onChange(stickers.filter((_, i) => i !== index))}
              />
            </motion.li>
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
      <AttachmentPicker type="sticker" open={picking} onOpenChange={setPicking} onPick={add} />
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
}: {
  index: number;
  sticker: StickerForm;
  slots: number;
  offset: ItemSpec['stickerOffset'];
  issue: FormIssue | undefined;
  errorText: (issue: FormIssue) => string;
  onChange: (patch: Partial<StickerForm>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('itemEditor');
  const slotId = useId();
  const name = sticker.name.replace(/^Adesivo \| /, '');
  const error = issue ? errorText(issue) : undefined;
  return (
    <fieldset
      className="mb-2 grid gap-3 rounded-lg bg-surface-2/50 p-3"
      data-testid={`sticker-${index}`}
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
          <select
            id={slotId}
            value={sticker.schema}
            onChange={(event) => onChange({ schema: Number(event.target.value) })}
            aria-invalid={!!error || undefined}
            aria-describedby={describedBy(slotId, { error })}
            className="min-h-(--tap) w-full appearance-none rounded-md bg-surface-2 px-3 text-[14px] aria-invalid:shadow-[inset_0_0_0_1.5px_var(--status-danger)]"
          >
            {Array.from({ length: slots }, (_, slot) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: o slot é o próprio índice.
              <option key={slot} value={slot}>
                {t('slotN', { n: slot + 1 })}
              </option>
            ))}
          </select>
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
        <details className="group/fine">
          <summary className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md px-2 -ml-2 text-[12.5px] font-medium text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-hover hover:text-foreground max-md:min-h-(--tap)">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-3.5 transition-transform duration-(--dur-fast) group-open/fine:rotate-90"
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
        </details>
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
        <span aria-hidden="true" className="label-caps text-[10.5px]">
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

/** Um charm: padrão (seed) e posição na arma, padrão ou personalizada (X, Y, Z). */
export function CharmEditor({
  charm,
  spec,
  issue,
  errorText,
  onChange,
}: {
  charm: CharmForm | null;
  spec: NonNullable<ItemSpec['charm']>;
  issue: FormIssue | undefined;
  errorText: (issue: FormIssue) => string;
  onChange: (charm: CharmForm | null) => void;
}) {
  const t = useTranslations('itemEditor');
  const [picking, setPicking] = useState(false);
  const seedId = useId();
  const error = issue ? errorText(issue) : undefined;
  const { x, y, z } = spec.position;
  const canPlace = hasBounds(x) && hasBounds(y) && hasBounds(z);
  const custom = charm?.x !== undefined;

  return (
    <section aria-labelledby="charm-title" className="grid gap-3">
      <h3 id="charm-title" className="label-caps text-[10.5px]">
        {t('charm')}
      </h3>
      {charm ? (
        <div
          className="grid gap-3 rounded-lg bg-surface-2/50 p-3 animate-fade-up"
          data-testid="charm"
        >
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
            <Button
              type="button"
              variant="quiet"
              size="icon"
              onClick={() => onChange(null)}
              aria-label={t('removeCharm', { name: charm.name })}
            >
              <AnimatedIcon icon={DeleteIcon} size={16} />
            </Button>
          </div>
          <div className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-3 max-md:grid-cols-1">
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
            {canPlace ? (
              <fieldset className="grid content-start gap-2">
                <legend className="mb-2 label-caps text-[10.5px]">{t('charmPosition')}</legend>
                <div className="flex gap-1">
                  {[false, true].map((isCustom) => (
                    <button
                      key={String(isCustom)}
                      type="button"
                      aria-pressed={custom === isCustom}
                      onClick={() =>
                        onChange(
                          isCustom
                            ? { ...charm, x: mid(x), y: mid(y), z: mid(z) }
                            : {
                                id: charm.id,
                                name: charm.name,
                                image: charm.image,
                                seed: charm.seed,
                              },
                        )
                      }
                      className="min-h-(--tap) rounded-md px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-(--dur-fast) hover:bg-hover hover:text-foreground aria-pressed:bg-surface-2 aria-pressed:text-foreground"
                    >
                      {isCustom ? t('positionCustom') : t('positionDefault')}
                    </button>
                  ))}
                </div>
                {custom ? (
                  <div className="grid grid-cols-3 gap-3 pt-1 animate-fade-up max-md:grid-cols-1">
                    {(['x', 'y', 'z'] as const).map((axis) => {
                      const bounds = spec.position[axis];
                      const value = charm[axis] ?? mid(bounds);
                      return hasBounds(bounds) ? (
                        <SliderField
                          key={axis}
                          label={t(`axis${axis.toUpperCase() as 'X' | 'Y' | 'Z'}`)}
                          value={value}
                          display={formatDecimal(value, 2)}
                          min={bounds.min}
                          max={bounds.max}
                          step={0.0001}
                          onChange={(v) => onChange({ ...charm, [axis]: v })}
                        />
                      ) : null;
                    })}
                  </div>
                ) : null}
              </fieldset>
            ) : null}
          </div>
        </div>
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
      <AttachmentPicker
        type="charm"
        open={picking}
        onOpenChange={setPicking}
        onPick={(label) => onChange({ ...label, seed: spec.seed.min })}
      />
    </section>
  );
}

const mid = (b: Bounds) => (b.min !== undefined && b.max !== undefined ? (b.min + b.max) / 2 : 0);
