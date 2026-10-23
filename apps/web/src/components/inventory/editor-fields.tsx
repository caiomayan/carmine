'use client';

import { useTranslations } from 'next-intl';
import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/animate-ui/components/radix/tooltip';
import { LockIcon } from '@/components/icons/animated/lock';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { LabelInput } from '@/components/ui/label-input';
import { wearGradient, wearSegments, wearTier } from '@/lib/catalog/wear';
import { formatDecimal, parseDecimal } from '@/lib/decimal';
import { cn } from '@/lib/utils';

/**
 * Campos do editor de Item. Tudo é formulário nativo (texto, slider, interruptor), então tudo
 * funciona com teclado e leitor de tela; o arrasto no 3D é só um atalho (Princípios
 * transversais). Cada campo liga o rótulo, a dica e o erro por `aria-describedby`.
 */

/** Selo de campo exclusivo do VIP: o cadeado e "VIP" à vista; a frase inteira só para leitor de tela. */
export function VipLock({ locked, badge }: { locked: ReactNode; badge: ReactNode }) {
  return (
    <span
      data-icon-trigger
      data-testid="field-vip-lock"
      className="inline-flex items-center gap-1 text-status-vip"
    >
      <AnimatedIcon icon={LockIcon} size={11} />
      <span aria-hidden="true">{badge}</span>
      <span className="sr-only">{locked}</span>
    </span>
  );
}

export function FieldShell({
  id,
  label,
  aside,
  hint,
  error,
  locked,
  lockedBadge,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  aside?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Texto completo para leitor de tela, quando o campo é exclusivo do VIP e a Conta não tem. */
  locked?: ReactNode;
  /** A forma curta e à vista ao lado do cadeado ("VIP"). */
  lockedBadge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2', className)} data-field={id}>
      <div className="flex min-h-4 items-baseline justify-between gap-3">
        <label htmlFor={id} className="inline-flex items-center gap-1.5 label-caps text-[11px]">
          {label}
          {locked ? <VipLock locked={locked} badge={lockedBadge} /> : null}
        </label>
        {aside ? <span className="text-body-sm font-semibold tabular-nums">{aside}</span> : null}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-body-sm text-foreground">
          <span
            aria-hidden="true"
            className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
          />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-body-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const describedBy = (id: string, { error, hint }: { error?: unknown; hint?: unknown }) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

const inputClass =
  'min-h-(--tap) w-full rounded-md bg-(--fill-rest) px-3 text-body tabular-nums outline-2 outline-transparent transition-[background-color,outline-color] duration-(--dur-fast) ease-std placeholder:text-muted-foreground hover:bg-(--fill-hover) focus:outline-(--focus-ring) aria-invalid:outline-status-danger aria-invalid:focus:outline-status-danger disabled:text-faint motion-reduce:transition-none';

/**
 * Número digitado (aceita "0,15" e "0.15"). Guarda o texto enquanto a pessoa digita; o valor
 * só muda quando o texto é um número. Fora de foco, mostra o valor formatado.
 */
export function DecimalInput({
  id,
  value,
  onChange,
  decimals,
  invalid,
  describedBy: described,
  testId,
  className,
  disabled,
  label,
  hint,
  error,
}: {
  id: string;
  value: number | null;
  onChange: (value: number | null) => void;
  decimals: number;
  invalid?: boolean;
  describedBy?: string;
  testId?: string;
  className?: string;
  disabled?: boolean;
  /** Com rótulo, o campo é o Label Input (rótulo flutuante, dica e erro embaixo). */
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  const format = (n: number | null) => (n === null ? '' : formatDecimal(n, decimals));
  const [text, setText] = useState(() => format(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value === null ? '' : formatDecimal(value, decimals));
  }, [value, decimals]);

  const field = {
    id,
    type: 'text' as const,
    inputMode: decimals > 0 ? ('decimal' as const) : ('numeric' as const),
    autoComplete: 'off',
    spellCheck: false,
    value: text,
    disabled,
    'data-testid': testId,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      setText(format(value));
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setText(event.target.value);
      onChange(parseDecimal(event.target.value));
    },
  };

  if (label) {
    return (
      <LabelInput
        {...field}
        label={label}
        hint={hint}
        error={error}
        aria-invalid={invalid || undefined}
        aria-describedby={described}
        className={cn('tabular-nums', className)}
      />
    );
  }

  return (
    <input
      {...field}
      data-field-ring=""
      aria-invalid={invalid || undefined}
      aria-describedby={described}
      className={cn(inputClass, className)}
    />
  );
}

/** Slider nativo com a parte preenchida acompanhando o valor. */
export function RangeInput({
  min,
  max,
  step,
  value,
  onChange,
  label,
  valueText,
  testId,
  disabled,
  track,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  label: string;
  valueText?: string;
  testId?: string;
  disabled?: boolean;
  /** Fundo próprio do trilho (ex.: a faixa colorida por fase do float). */
  track?: string;
}) {
  const span = max - min || 1;
  const percent = Math.min(Math.max(((value - min) / span) * 100, 0), 100);
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : min}
      disabled={disabled}
      aria-label={label}
      aria-valuetext={valueText}
      data-testid={testId}
      onChange={(event) => onChange(Number(event.target.value))}
      style={
        {
          '--p': `${percent}%`,
          ...(track ? { '--range-bg': track, '--range-h': '6px' } : {}),
        } as CSSProperties
      }
      className="range"
    />
  );
}

/**
 * O float: valor digitado, slider dentro da faixa da skin e a régua das fases do desgaste
 * (NF a VG) recortada nessa faixa. O trilho do slider é uma faixa colorida por fase, da Nova de
 * Fábrica (verde) à Veterana de Guerra (vermelho), cor de contexto: o nome da fase atual vem
 * escrito ao lado do valor e cada fase da régua tem o nome completo num Tooltip.
 */
export function FloatField({
  range,
  value,
  onChange,
  error,
}: {
  range: { min: number; max: number };
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string;
}) {
  const t = useTranslations('itemEditor');
  const id = useId();
  const current = value ?? range.min;
  const tier = wearTier(Math.min(Math.max(current, 0), 1));
  const hint = t('floatRange', {
    min: formatDecimal(range.min, 2, { fixed: true }),
    max: formatDecimal(range.max, 2, { fixed: true }),
  });
  const segments = wearSegments(range);

  return (
    <FieldShell
      id={id}
      label={t('float')}
      aside={<span data-testid="wear-tier">{t(`wear.${tier}`)}</span>}
      hint={hint}
      error={error}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-3 max-md:grid-cols-[minmax(0,1fr)_6.5rem]">
        <div className="grid gap-1">
          <RangeInput
            min={range.min}
            max={range.max}
            step={0.0001}
            value={current}
            onChange={(next) => onChange(Number(next.toFixed(6)))}
            label={t('float')}
            valueText={`${formatDecimal(current, 6)} · ${t(`wear.${tier}`)}`}
            track={wearGradient(segments)}
            testId="field-wear-range"
          />
          <div
            aria-hidden="true"
            data-testid="wear-ruler"
            className="flex text-[11px] font-semibold tracking-[0.06em] text-muted-foreground"
          >
            {segments.map((segment) => (
              <Tooltip key={segment.tier}>
                <TooltipTrigger asChild>
                  <span
                    style={{ width: `${segment.width}%` }}
                    data-tier={segment.tier}
                    className={cn(
                      'truncate border-l border-line pl-1 transition-colors duration-(--dur-base) ease-std first:border-l-0 first:pl-0',
                      segment.tier === tier && 'text-foreground',
                    )}
                  >
                    {segment.width > 8 ? t(`wearShort.${segment.tier}`) : ' '}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" sideOffset={4}>
                  {t(`wear.${segment.tier}`)}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
        <DecimalInput
          id={id}
          value={value}
          onChange={onChange}
          decimals={6}
          invalid={!!error}
          describedBy={describedBy(id, { error, hint })}
          testId="field-wear"
          className="text-right"
        />
      </div>
    </FieldShell>
  );
}
