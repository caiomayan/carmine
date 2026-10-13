'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useId, useRef, useState } from 'react';
import { CheckIcon } from '@/components/icons/animated/check';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { Field, FieldError, Textarea } from './fields';
import type { StaffResult } from './use-staff-request';

/** Limites do motivo (`staffReasonSchema`): vai para o log de auditoria. */
export const REASON_MIN = 3;
export const REASON_MAX = 500;

const reveal = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const },
};

/** O motivo de toda ação da Staff, com contador e a dica de que é interno. */
export function ReasonField({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const t = useTranslations('staff.reason');
  return (
    <Field
      id={id}
      label={t('label')}
      hint={t('hint')}
      error={error}
      aside={t('count', { count: value.length, max: REASON_MAX })}
    >
      <Textarea
        id={id}
        name="reason"
        value={value}
        maxLength={REASON_MAX}
        required
        rows={2}
        placeholder={t('placeholder')}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        onChange={(event) => onChange(event.target.value)}
        data-testid="reason"
      />
    </Field>
  );
}

/**
 * Uma ação da Staff com motivo: campos próprios (opcionais), o motivo e o botão. Com `collapsed`,
 * começa como um botão que abre o formulário ali mesmo (sem modal). Mostra o erro pelo código
 * da API e confirma o sucesso em texto (região viva).
 */
export function ActionForm({
  label,
  description,
  children,
  submitLabel,
  doneLabel,
  variant = 'ghost',
  collapsed = false,
  disabled = false,
  validate,
  onSubmit,
  testId,
}: {
  label: string;
  description?: ReactNode;
  children?: ReactNode;
  submitLabel: string;
  doneLabel: string;
  variant?: 'primary' | 'ghost';
  collapsed?: boolean;
  disabled?: boolean;
  /** Erro dos campos próprios, antes de enviar; nulo se está tudo certo. */
  validate?: () => string | null;
  onSubmit: (reason: string) => Promise<StaffResult<unknown>>;
  testId?: string;
}) {
  const t = useTranslations('staff');
  const id = useId();
  const [open, setOpen] = useState(!collapsed);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setDone(false);
    setError(null);
    const fieldsError = validate?.() ?? null;
    if (fieldsError) {
      setError(fieldsError);
      return;
    }
    if (reason.trim().length < REASON_MIN) {
      setReasonError(t('reason.tooShort', { min: REASON_MIN }));
      formRef.current?.querySelector('textarea')?.focus();
      return;
    }
    setReasonError(null);
    setPending(true);
    const result = await onSubmit(reason.trim());
    setPending(false);
    if (result.ok) {
      setReason('');
      setDone(true);
      if (collapsed) setOpen(false);
    } else {
      setError(t(`errors.${result.code}`));
    }
  };

  const form = (
    <form ref={formRef} onSubmit={submit} noValidate className="grid gap-4" data-testid={testId}>
      {description ? <div className="text-[13px] text-muted-foreground">{description}</div> : null}
      {children}
      <ReasonField
        id={`${id}-reason`}
        value={reason}
        onChange={(value) => {
          setReason(value);
          if (reasonError && value.trim().length >= REASON_MIN) setReasonError(null);
        }}
        error={reasonError}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant={variant}
          size="sm"
          disabled={disabled || pending}
          aria-busy={pending || undefined}
          className={variant === 'ghost' ? 'bg-surface-2 hover:bg-line' : undefined}
        >
          {submitLabel}
        </Button>
        {collapsed ? (
          <Button type="button" variant="quiet" size="sm" onClick={() => setOpen(false)}>
            {t('apply.cancel')}
          </Button>
        ) : null}
      </div>
      {error ? (
        <div role="alert">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
    </form>
  );

  return (
    <div className="grid gap-2">
      {collapsed ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => {
              setOpen((value) => !value);
              setDone(false);
            }}
            className="-ml-3"
          >
            {label}
          </Button>
        </div>
      ) : null}
      {collapsed ? (
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div key="form" {...reveal} className="overflow-hidden">
              <div className="pt-1 pb-1">{form}</div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : (
        form
      )}
      <p role="status" className="text-[12.5px] text-muted-foreground empty:hidden">
        {done ? (
          <span className="inline-flex items-center gap-1.5" data-icon-trigger>
            <span className="text-status-success">
              <AnimatedIcon icon={CheckIcon} size={14} />
            </span>
            {doneLabel}
          </span>
        ) : null}
      </p>
    </div>
  );
}
