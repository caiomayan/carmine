'use client';

import { CheckIcon } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { arm, type ConfirmGate, disarm, IDLE, isArmed, mayConfirm } from '@/lib/confirm-gate';
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
  confirmation,
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
  /**
   * Ação que mexe em dinheiro ou não tem volta: depois de preencher, o primeiro envio mostra o que vai acontecer (com os
   * números, lidos na hora) e só o segundo envia. Mudar o motivo desfaz a confirmação.
   */
  confirmation?: { title: string; body: () => string; confirmLabel: string };
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
  const [gate, setGate] = useState<ConfirmGate>(IDLE);
  const confirming = isArmed(gate);
  // Trava síncrona contra o envio em dobro: `pending` só vale depois da próxima pintura.
  const sending = useRef(false);

  /** Valida o motivo e os campos extras; devolve o motivo pronto ou `null` (o erro já está na tela). */
  const check = (): string | null => {
    const text = reason.trim();
    if (text.length < REASON_MIN) {
      setError(`Escreva o motivo (pelo menos ${REASON_MIN} caracteres).`);
      setErrorField(null);
      return null;
    }
    const found = validate?.() ?? null;
    const extra = typeof found === 'string' ? { message: found } : found;
    if (extra) {
      setError(extra.message);
      setErrorField(extra.fieldId ?? null);
      return null;
    }
    setError(null);
    setErrorField(null);
    return text;
  };

  const send = async (text: string) => {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    const result = await onSubmit(text);
    sending.current = false;
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      setErrorField(null);
      setGate(disarm());
      return;
    }
    setDone(true);
    onSuccess?.(result.data);
    onDone?.();
  };

  /** Enviar o formulário: sem confirmação, envia; com ela, só a mostra (o Enter nunca confirma). */
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (confirmation && confirming) return;
    const text = check();
    if (text === null) return;
    if (confirmation) {
      setGate(arm(Date.now()));
      return;
    }
    void send(text);
  };

  /** O botão de confirmar é outro botão, e só vale depois do atraso e com os valores ainda válidos. */
  const confirm = (clicks: number) => {
    // Um clique que faz parte de um duplo clique (detail > 1) nunca confirma, qualquer que seja o atraso do sistema.
    if (clicks > 1 || !mayConfirm(gate, Date.now())) return;
    const text = check();
    if (text === null) {
      setGate(disarm());
      return;
    }
    void send(text);
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
    <form
      className="stp-form"
      onSubmit={submit}
      // Qualquer edição (motivo, dias, chave) desfaz a confirmação: o valor novo pede outra.
      onChange={() => setGate(disarm())}
      data-testid={testId}
      noValidate
    >
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
      {confirmation && confirming ? (
        <fieldset className="stp-confirm" data-testid={`${testId}-confirm`}>
          <legend className="stp-confirm-title">{confirmation.title}</legend>
          <p>{confirmation.body()}</p>
        </fieldset>
      ) : null}
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
            setGate(disarm());
            onCancel?.();
          }}
          disabled={pending}
        >
          Cancelar
        </button>
        {confirmation && confirming ? (
          <button
            key="confirm"
            type="button"
            className="stp-btn"
            data-kind={kind === 'danger' ? 'danger-fill' : 'primary'}
            onClick={(event) => confirm(event.detail)}
            disabled={pending}
            aria-busy={pending || undefined}
            data-testid={`${testId}-confirm-submit`}
          >
            {confirmation.confirmLabel}
          </button>
        ) : (
          <button
            key="submit"
            type="submit"
            className="stp-btn"
            data-kind={kind === 'danger' ? 'danger-fill' : 'primary'}
            disabled={pending}
            aria-busy={pending || undefined}
            data-testid={`${testId}-submit`}
          >
            {submitLabel}
          </button>
        )}
      </div>
    </form>
  );
}
