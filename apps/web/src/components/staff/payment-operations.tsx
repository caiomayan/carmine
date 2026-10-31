'use client';

import type { StaffCompensationOverview } from '@carmine/contracts';
import {
  COMPENSATION_MAX_DAYS,
  staffCompensationResultSchema,
  staffReconcileResultSchema,
} from '@carmine/contracts/staff-payments';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { SectionTitle } from '@/components/section-title';
import { Button } from '@/components/ui/button';
import { LabelInput } from '@/components/ui/label-input';
import { formatDateTime } from '@/lib/purchases';
import { ActionForm } from './action-form';
import { FieldError } from './fields';
import { useStaffRequest } from './use-staff-request';

/**
 * As operações em lote dos pagamentos: conciliar agora com o provedor e compensar por indisponibilidade
 * (D4: o alerta antes, a confirmação com os números, os dias e o log). Só o Dono e o Admin chegam aqui.
 */
export function PaymentOperations({
  overview,
  defaultKey,
}: {
  overview: StaffCompensationOverview;
  defaultKey: string;
}) {
  const t = useTranslations('staff.payments.operations');
  return (
    <section
      aria-labelledby="operacoes"
      className="grid gap-6 animate-fade-up [animation-delay:100ms]"
      data-testid="payment-operations"
    >
      <SectionTitle id="operacoes">{t('title')}</SectionTitle>
      <Reconcile />
      <Compensation overview={overview} defaultKey={defaultKey} />
    </section>
  );
}

function Reconcile() {
  const t = useTranslations('staff.payments.operations.reconcile');
  const errors = useTranslations('staff.errors');
  const router = useRouter();
  const { request, pending } = useStaffRequest();
  const id = useId();
  const [days, setDays] = useState('8');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setDone(null);
    setError(null);
    const value = Number(days);
    if (!Number.isInteger(value) || value < 1 || value > 400) {
      setError(errors('invalid_body'));
      return;
    }
    const result = await request(
      '/api/staff/payments/reconcile',
      'POST',
      { days: value },
      staffReconcileResultSchema,
    );
    if (result.ok) {
      setDone(t('done', result.data));
      router.refresh();
    } else {
      setError(errors(result.code));
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid max-w-xl gap-3" data-testid="reconcile-form">
      <h3 className="text-sm font-semibold">{t('title')}</h3>
      <p className="text-body-sm text-muted-foreground">{t('hint')}</p>
      <div className="flex flex-wrap items-start gap-3">
        <LabelInput
          id={`${id}-days`}
          label={t('days')}
          type="number"
          inputMode="numeric"
          min={1}
          max={400}
          value={days}
          onChange={(event) => setDays(event.target.value)}
          containerClassName="w-40"
          className="tabular-nums"
        />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-busy={pending || undefined}
          className="mt-2"
        >
          {t('submit')}
        </Button>
      </div>
      {error ? (
        <div role="alert">
          <FieldError>{error}</FieldError>
        </div>
      ) : null}
      <p role="status" className="text-body-sm text-muted-foreground empty:hidden">
        {done}
      </p>
    </form>
  );
}

function Compensation({
  overview,
  defaultKey,
}: {
  overview: StaffCompensationOverview;
  defaultKey: string;
}) {
  const t = useTranslations('staff.payments.operations.compensation');
  const errors = useTranslations('staff.errors');
  const router = useRouter();
  const { request } = useStaffRequest();
  const id = useId();
  const [days, setDays] = useState('1');
  const [key, setKey] = useState(defaultKey);
  const daysValue = Number(days);
  const keyValue = key.trim();

  return (
    <div className="grid max-w-xl gap-3" data-testid="compensation">
      <h3 className="text-sm font-semibold">{t('title')}</h3>
      <p className="text-body-sm text-muted-foreground">{t('hint')}</p>
      <p className="text-body-sm font-semibold" data-testid="compensation-active">
        {t('activeNow', { count: overview.activeVips })}
      </p>
      <ActionForm
        collapsed
        variant="primary"
        label={t('open')}
        submitLabel={t('submit')}
        doneLabel={t('done')}
        testId="compensation-form"
        disabled={overview.activeVips === 0}
        validate={() => {
          if (!Number.isInteger(daysValue) || daysValue < 1 || daysValue > COMPENSATION_MAX_DAYS) {
            return errors('invalid_body');
          }
          return /^[A-Za-z0-9._:-]{3,80}$/.test(keyValue) ? null : errors('invalid_body');
        }}
        confirmation={{
          title: t('confirmTitle'),
          description: t('confirmBody', {
            days: daysValue,
            count: overview.activeVips,
            key: keyValue,
          }),
          confirmLabel: t('confirm'),
        }}
        onSubmit={async (reason) => {
          const result = await request(
            '/api/staff/payments/compensation',
            'POST',
            { days: daysValue, key: keyValue, reason },
            staffCompensationResultSchema,
          );
          if (result.ok) router.refresh();
          return result;
        }}
      >
        <div className="flex flex-wrap items-start gap-3">
          <LabelInput
            id={`${id}-days`}
            label={t('days')}
            type="number"
            inputMode="numeric"
            min={1}
            max={COMPENSATION_MAX_DAYS}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            containerClassName="w-40"
            className="tabular-nums"
          />
          <LabelInput
            id={`${id}-key`}
            label={t('key')}
            hint={t('keyHint')}
            value={key}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setKey(event.target.value)}
            containerClassName="min-w-56 flex-1"
          />
        </div>
      </ActionForm>
      <div className="grid gap-1 pt-2">
        <h4 className="text-body-sm font-semibold">{t('recent')}</h4>
        {overview.recent.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{t('recentEmpty')}</p>
        ) : (
          <ol className="grid" data-testid="compensation-recent">
            {overview.recent.map((entry) => (
              <li
                key={`${entry.key}-${entry.createdAt}`}
                className="grid gap-0.5 border-b border-line/60 py-2.5 text-body-sm last:border-b-0"
              >
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">
                    {t('recentLine', { days: entry.days, accounts: entry.accounts })}
                  </span>
                  <span className="text-muted-foreground tabular-nums">{entry.key}</span>
                </p>
                <p className="text-muted-foreground">{entry.reason}</p>
                <p className="text-caption text-muted-foreground">
                  {formatDateTime(entry.createdAt)} ·{' '}
                  {t('by', { name: entry.actorName ?? entry.actorSteamId })}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
