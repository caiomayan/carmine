'use client';

import { CheckIcon } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import type { StaffResult } from '@/lib/staff-request';

export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** Erro de um campo extra: `fieldId` é o campo que recebe o foco e o `aria-invalid`; sem ele, o erro é da Nota. */
export type FieldError = { message: string; fieldId?: string };

/**
 * Uma ação da Staff que pede um motivo (arquivar a Denúncia, manter ou remover a foto): o botão abre o formulário no
 * próprio lugar (sem modal), com o motivo (3 a 500 caracteres, o mesmo limite da API) e os campos extras do
 * `children`. Confirma só com o motivo válido; o erro da API aparece sob o campo, em texto. Depois de feito, mostra
 * `doneLabel` e chama `onDone`.
 */
export function ActionForm<T = unknown>({
  label,
  submitLabel,
  doneLabel,
  testId,
  kind = 'default',
  reasonLabel = 'Motivo (vai para o log de auditoria)',
  description,
  validate,
  onSubmit,
  onDone,
  onCancel,
  onSuccess,
  children,
}: {
  label: string;
  submitLabel: string;
  doneLabel: string;
  testId: string;
  kind?: 'default' | 'danger';
  reasonLabel?: string;
  /** Explica a ação ao abrir o formulário. */
  description?: string;
  /** Erro dos campos extras, ou `null` se está tudo certo. Com `fieldId`, o foco e o `aria-invalid` vão a esse campo. */
  validate?: () => string | FieldError | null;
  onSubmit: (reason: string) => Promise<StaffResult<T>>;
  onDone?: () => void;
  /** Chamado ao cancelar (o formulário fecha); quem tem campos extras desfaz o rascunho aqui. */
  onCancel?: () => void;
  /** Recebe o que a API devolveu (ex.: a ficha atualizada). */
  onSuccess?: (data: T) => void;
  children?: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // O campo extra com erro: ele aponta para a mensagem (`aria-describedby`) e recebe o foco.
  const [errorField, setErrorField] = useState<string | null>(null);
  const errorId = `${id}-error`;

  useEffect(() => {
    if (!errorField) return;
    const field = document.getElementById(errorField);
    if (!field) return;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', errorId);
    field.focus();
    return () => {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    };
  }, [errorField, errorId]);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = reason.trim();
    if (text.length < REASON_MIN) {
      setError(`Escreva o motivo (pelo menos ${REASON_MIN} caracteres).`);
      setErrorField(null);
      return;
    }
    const found = validate?.() ?? null;
    const extra = typeof found === 'string' ? { message: found } : found;
    if (extra) {
      setError(extra.message);
      setErrorField(extra.fieldId ?? null);
      return;
    }
    setError(null);
    setErrorField(null);
    setPending(true);
    const result = await onSubmit(text);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      setErrorField(null);
      return;
    }
    setDone(true);
    onSuccess?.(result.data);
    onDone?.();
  };

  if (done) {
    return (
      <p className="stp-done" role="status" data-testid={`${testId}-done`}>
        <CheckIcon size={15} aria-hidden="true" /> {doneLabel}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="stp-btn"
        data-kind={kind === 'danger' ? 'danger' : undefined}
        onClick={() => setOpen(true)}
        data-testid={`${testId}-open`}
      >
        {label}
      </button>
    );
  }

  return (
    <form className="stp-form" onSubmit={submit} data-testid={testId} noValidate>
      {description ? <p className="stp-muted">{description}</p> : null}
      {children}
      <label className="stp-label" htmlFor={`${id}-reason`}>
        {reasonLabel}
        <span className="stp-label-count">
          {reason.length}/{REASON_MAX}
        </span>
      </label>
      <textarea
        id={`${id}-reason`}
        className="stp-textarea"
        rows={3}
        maxLength={REASON_MAX}
        value={reason}
        onChange={(event) => {
          setReason(event.target.value);
          if (error) {
            setError(null);
            setErrorField(null);
          }
        }}
        aria-invalid={error && !errorField ? true : undefined}
        aria-describedby={error && !errorField ? errorId : undefined}
        data-testid={`${testId}-reason`}
      />
      {error ? (
        <p id={errorId} className="stp-field-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="stp-form-actions">
        <button
          type="button"
          className="stp-btn"
          onClick={() => {
            setOpen(false);
            onCancel?.();
          }}
          disabled={pending}
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="stp-btn"
          data-kind={kind === 'danger' ? 'danger-fill' : 'primary'}
          disabled={pending}
          aria-busy={pending || undefined}
          data-testid={`${testId}-submit`}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
