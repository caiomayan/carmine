'use client';

import {
  isLastingSanction,
  RECIDIVISM_WINDOW_DAYS,
  SANCTION_MAX_DURATION_MINUTES,
  type SanctionCategory,
  type SanctionMeasure,
  type SanctionType,
  type StaffAccountDetail,
  sanctionCategorySchema,
  staffAccountDetailSchema,
} from '@carmine/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useRef, useState } from 'react';
import { CheckIcon } from '@/components/icons/animated/check';
import { PlusIcon } from '@/components/icons/animated/plus';
import { XIcon } from '@/components/icons/animated/x';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { type DurationUnit, durationParts, sameMeasures, toMinutes } from '@/lib/moderation';
import { measureOptions, type StaffViewer } from '@/lib/staff';
import { cn } from '@/lib/utils';
import { REASON_MIN, ReasonField } from './action-form';
import { Field, FieldError, Select, TextInput } from './fields';
import { useMeasureLabel } from './use-measure-label';
import { useStaffRequest } from './use-staff-request';

type Draft = { type: SanctionType; value: string; unit: DurationUnit; permanent: boolean };

const UNITS: DurationUnit[] = ['minute', 'hour', 'day'];

function toDraft(measure: SanctionMeasure): Draft {
  const parts = durationParts(measure.durationMinutes);
  return parts.unit === 'permanent'
    ? { type: measure.type, value: '1', unit: 'day', permanent: isLastingSanction(measure.type) }
    : { type: measure.type, value: String(parts.value), unit: parts.unit, permanent: false };
}

/** A medida do rascunho; nulo se a duração não é um número válido. */
function toMeasure(draft: Draft): SanctionMeasure | null {
  if (!isLastingSanction(draft.type)) return { type: draft.type, durationMinutes: null };
  if (draft.permanent) return { type: draft.type, durationMinutes: null };
  const value = Number(draft.value);
  if (!Number.isInteger(value) || value < 1) return null;
  const minutes = toMinutes(value, draft.unit);
  return minutes > SANCTION_MAX_DURATION_MINUTES
    ? null
    : { type: draft.type, durationMinutes: minutes };
}

/**
 * Aplicar Punição: a Staff escolhe a Categoria, o painel mostra a reincidência na janela de 30
 * dias e preenche as medidas com a sugestão da tabela; a Staff confirma ou ajusta, escreve o
 * motivo e revisa antes de aplicar. Sem modal: a revisão abre no próprio formulário.
 */
export function ApplySanctionForm({
  detail,
  viewer,
  onApplied,
}: {
  detail: StaffAccountDetail;
  viewer: StaffViewer;
  onApplied: (detail: StaffAccountDetail) => void;
}) {
  const t = useTranslations('staff');
  const tm = useTranslations('moderation');
  const label = useMeasureLabel();
  const id = useId();
  const { request, pending } = useStaffRequest();
  const options = measureOptions(viewer.role);
  const [category, setCategory] = useState<SanctionCategory | ''>('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [done, setDone] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const suggestion = category ? detail.suggestions.find((s) => s.category === category) : undefined;
  const measures = drafts.map(toMeasure);
  const valid = measures.every((m): m is SanctionMeasure => m !== null);
  const chosen = valid ? (measures as SanctionMeasure[]) : [];
  const follows = suggestion && valid ? sameMeasures(chosen, suggestion.measures) : false;
  const blockedPermanent =
    !options.permanent && drafts.some((d) => isLastingSanction(d.type) && d.permanent);
  const duplicateType = new Set(drafts.map((d) => d.type)).size !== drafts.length;

  const pickCategory = (value: string) => {
    const next = sanctionCategorySchema.safeParse(value);
    setReviewing(false);
    setDone(false);
    setError(null);
    if (!next.success) {
      setCategory('');
      setDrafts([]);
      return;
    }
    setCategory(next.data);
    const s = detail.suggestions.find((x) => x.category === next.data);
    setDrafts((s?.measures ?? [{ type: 'warning', durationMinutes: null }]).map(toDraft));
  };

  const update = (index: number, patch: Partial<Draft>) => {
    setReviewing(false);
    setDrafts((current) => current.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const review = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (!category || !valid || blockedPermanent || duplicateType) return;
    if (reason.trim().length < REASON_MIN) {
      setReasonError(t('reason.tooShort', { min: REASON_MIN }));
      document.getElementById(`${id}-reason`)?.focus();
      return;
    }
    setReasonError(null);
    setReviewing(true);
    requestAnimationFrame(() => confirmRef.current?.focus());
  };

  const apply = async () => {
    if (!category) return;
    const result = await request(
      `/api/staff/accounts/${detail.account.publicId}/sanctions`,
      'POST',
      { category, reason: reason.trim(), measures: chosen },
      staffAccountDetailSchema,
    );
    if (!result.ok) {
      setReviewing(false);
      setError(t(`errors.${result.code}`));
      return;
    }
    onApplied(result.data);
    setCategory('');
    setDrafts([]);
    setReason('');
    setReviewing(false);
    setDone(true);
  };

  const offenses = (c: SanctionCategory) =>
    detail.suggestions.find((s) => s.category === c)?.previousOffenses ?? 0;

  return (
    <form onSubmit={review} noValidate className="grid gap-5" data-testid="apply-sanction">
      <Field id={`${id}-category`} label={t('apply.category')}>
        <Select
          id={`${id}-category`}
          value={category}
          onChange={(event) => pickCategory(event.target.value)}
          data-testid="sanction-category"
        >
          <option value="">{t('apply.chooseCategory')}</option>
          {sanctionCategorySchema.options.map((c) => (
            <option key={c} value={c}>
              {tm(`staffCategories.${c}`)}
              {offenses(c) > 0
                ? ` · ${t('apply.offenses', { count: offenses(c), days: RECIDIVISM_WINDOW_DAYS })}`
                : ''}
            </option>
          ))}
        </Select>
      </Field>

      <AnimatePresence initial={false}>
        {category ? (
          <motion.div
            key="measures"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="-mx-1 overflow-hidden px-1"
          >
            <div className="grid gap-5 pb-1">
              {suggestion ? (
                <div
                  data-testid="sanction-suggestion"
                  data-offense={suggestion.offense}
                  className="grid gap-1 rounded-lg bg-surface px-4 py-3"
                >
                  <p className="text-[13px] text-muted-foreground">
                    {t('apply.suggestion', {
                      offense: suggestion.offense,
                      days: RECIDIVISM_WINDOW_DAYS,
                    })}
                  </p>
                  <p className="text-md font-semibold" data-testid="suggested-measures">
                    {suggestion.measures.map(label).join(' + ')}
                  </p>
                </div>
              ) : null}

              <fieldset className="grid gap-3">
                <legend className="flex w-full items-center justify-between gap-3 pb-3">
                  <span className="text-[12.5px] font-semibold">{t('apply.measures')}</span>
                  {valid && suggestion ? (
                    <span
                      data-testid="suggestion-state"
                      data-follows={follows}
                      className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'size-1.5 rounded-full',
                          follows ? 'bg-status-success' : 'bg-status-warn',
                        )}
                      />
                      {follows ? t('apply.suggested') : t('apply.adjusted')}
                    </span>
                  ) : null}
                </legend>
                {drafts.map((draft, index) => (
                  <MeasureRow
                    // biome-ignore lint/suspicious/noArrayIndexKey: as medidas não têm id; no máximo 2, na ordem.
                    key={index}
                    id={`${id}-m${index}`}
                    draft={draft}
                    allowPermanent={options.permanent}
                    types={options.types}
                    onChange={(patch) => update(index, patch)}
                    onRemove={
                      drafts.length > 1
                        ? () => setDrafts((current) => current.filter((_, i) => i !== index))
                        : undefined
                    }
                  />
                ))}
                <div className="flex flex-wrap gap-1">
                  {drafts.length < 2 ? (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      className="-ml-3"
                      data-icon-trigger
                      onClick={() =>
                        setDrafts((current) => [
                          ...current,
                          { type: 'ban', value: '1', unit: 'day', permanent: false },
                        ])
                      }
                    >
                      <AnimatedIcon icon={PlusIcon} size={15} />
                      {t('apply.addMeasure')}
                    </Button>
                  ) : null}
                  {suggestion && valid && !follows ? (
                    <Button
                      type="button"
                      variant="quiet"
                      size="sm"
                      onClick={() => pickCategory(suggestion.category)}
                    >
                      {t('apply.useSuggestion')}
                    </Button>
                  ) : null}
                </div>
                {blockedPermanent ? (
                  <FieldError>{t('apply.permanentNotAllowed')}</FieldError>
                ) : null}
                {duplicateType ? <FieldError>{t('errors.invalid_body')}</FieldError> : null}
              </fieldset>

              <ReasonField
                id={`${id}-reason`}
                value={reason}
                onChange={(value) => {
                  setReason(value);
                  setReviewing(false);
                  if (reasonError && value.trim().length >= REASON_MIN) setReasonError(null);
                }}
                error={reasonError}
              />

              <AnimatePresence initial={false} mode="wait">
                {reviewing ? (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    role="group"
                    aria-labelledby={`${id}-confirm`}
                    className="grid gap-3 rounded-lg bg-surface-2 px-4 py-3.5"
                    data-testid="sanction-confirm"
                  >
                    <p id={`${id}-confirm`} className="text-sm font-semibold">
                      {t('apply.confirmTitle')}
                    </p>
                    <p className="text-[13.5px]">
                      {t('apply.confirmBody', {
                        name: detail.account.displayName,
                        measures: chosen.map(label).join(' + '),
                        category: tm(`categories.${category}`),
                      })}
                    </p>
                    {chosen.some((m) => m.type === 'ban') ? (
                      <p className="text-[12.5px] text-muted-foreground">{t('apply.banEffect')}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        ref={confirmRef}
                        type="button"
                        size="sm"
                        disabled={pending}
                        aria-busy={pending || undefined}
                        onClick={apply}
                        data-testid="sanction-apply"
                      >
                        {t('apply.confirm')}
                      </Button>
                      <Button
                        type="button"
                        variant="quiet"
                        size="sm"
                        onClick={() => setReviewing(false)}
                      >
                        {t('apply.cancel')}
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!valid || blockedPermanent || duplicateType}
                      data-testid="sanction-review"
                    >
                      {t('apply.review')}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div role="status" className="empty:hidden">
        {done ? (
          <p
            className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground"
            data-icon-trigger
          >
            <span className="text-status-success">
              <AnimatedIcon icon={CheckIcon} size={14} />
            </span>
            {t('apply.done')}
          </p>
        ) : null}
      </div>
      {error ? (
        <div role="alert">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
    </form>
  );
}

function MeasureRow({
  id,
  draft,
  types,
  allowPermanent,
  onChange,
  onRemove,
}: {
  id: string;
  draft: Draft;
  types: SanctionType[];
  allowPermanent: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations('staff.apply');
  const tm = useTranslations('moderation');
  const lasting = isLastingSanction(draft.type);
  const invalidValue = lasting && !draft.permanent && toMeasure(draft) === null;

  return (
    <div
      data-testid="measure-row"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2 gap-y-3 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)_auto]"
    >
      <Field id={`${id}-type`} label={t('type')}>
        <Select
          id={`${id}-type`}
          value={draft.type}
          onChange={(event) => onChange({ type: event.target.value as SanctionType })}
          data-testid="measure-type"
        >
          {types.map((type) => (
            <option key={type} value={type}>
              {tm(`types.${type}`)} — {tm(`typeHints.${type}`)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto">
        {lasting ? (
          <fieldset className="grid gap-1.5">
            <legend className="pb-1.5 text-[12.5px] font-semibold">{t('duration')}</legend>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${id}-value`} className="sr-only">
                {t('durationValue')}
              </label>
              <TextInput
                id={`${id}-value`}
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.value}
                disabled={draft.permanent}
                aria-invalid={invalidValue || undefined}
                onChange={(event) => onChange({ value: event.target.value })}
                className="w-20 tabular-nums"
                data-testid="measure-value"
              />
              <label htmlFor={`${id}-unit`} className="sr-only">
                {t('durationUnit')}
              </label>
              <Select
                id={`${id}-unit`}
                value={draft.unit}
                disabled={draft.permanent}
                onChange={(event) => onChange({ unit: event.target.value as DurationUnit })}
                className="w-32"
                data-testid="measure-unit"
              >
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {t(`units.${unit}`)}
                  </option>
                ))}
              </Select>
              <label
                className={cn(
                  'inline-flex min-h-(--tap) cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors duration-(--dur-fast) ease-std hover:bg-hover',
                  !allowPermanent &&
                    !draft.permanent &&
                    'cursor-not-allowed text-faint hover:bg-transparent',
                )}
              >
                <input
                  type="checkbox"
                  checked={draft.permanent}
                  disabled={!allowPermanent && !draft.permanent}
                  onChange={(event) => onChange({ permanent: event.target.checked })}
                  className="size-4 accent-current"
                  data-testid="measure-permanent"
                />
                {t('permanent')}
              </label>
            </div>
          </fieldset>
        ) : null}
      </div>
      {onRemove ? (
        <Button
          type="button"
          variant="quiet"
          size="icon"
          aria-label={t('removeMeasure')}
          onClick={onRemove}
          className="col-start-2 row-start-1 md:col-start-3"
          data-icon-trigger
        >
          <AnimatedIcon icon={XIcon} size={16} />
        </Button>
      ) : null}
    </div>
  );
}
