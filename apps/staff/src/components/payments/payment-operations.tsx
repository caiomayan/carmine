'use client';

import {
  COMPENSATION_MAX_DAYS,
  type StaffCompensationOverview,
  staffCompensationResultSchema,
  staffReconcileResultSchema,
} from '@carmine/contracts/staff-payments';
import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { ActionForm } from '@/components/queue/action-form';
import { stamp } from '@/components/queue/bits';
import { staffPost } from '@/lib/staff-request';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{3,80}$/;

/**
 * As operações em lote dos pagamentos (Dono e Admin): conciliar com o provedor e compensar por indisponibilidade (D4: o
 * número de Contas antes, a confirmação com os números, os dias, a chave única e o log). Mesmas ações do CLI
 * `payments reconcile` e `payments compensate`.
 */
export function PaymentOperations({
  overview,
  defaultKey,
}: {
  overview: StaffCompensationOverview | null;
  defaultKey: string;
}) {
  return (
    <section className="stp-ops" aria-label="Operações" data-testid="payment-operations">
      <Reconcile />
      {overview ? (
        <Compensation overview={overview} defaultKey={defaultKey} />
      ) : (
        <div className="stp-card stp-ops-card">
          <h2 className="stp-detail-title">Compensar por indisponibilidade</h2>
          <p className="stp-field-error" role="alert">
            Sem dado: não deu para ler quantas Contas têm VIP ativo agora. Recarregue a página.
          </p>
        </div>
      )}
    </section>
  );
}

function Reconcile() {
  const id = useId();
  const router = useRouter();
  const [days, setDays] = useState('8');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Conciliar só lê o provedor e corrige o que ficou para trás: a API não pede motivo (o contrato recebe só os dias).
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setDone(null);
    const value = Number(days);
    if (!Number.isInteger(value) || value < 1 || value > 400) {
      setError('Os dias vão de 1 a 400.');
      return;
    }
    setError(null);
    setPending(true);
    const result = await staffPost('/api/staff/payments/reconcile', { days: value }, (json) =>
      staffReconcileResultSchema.parse(json),
    );
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const { checked, changed } = result.data;
    setDone(
      `${checked} ${checked === 1 ? 'conferido' : 'conferidos'} com o provedor, ${changed} ${changed === 1 ? 'mudou' : 'mudaram'}.`,
    );
    router.refresh();
  };

  return (
    <div className="stp-card stp-ops-card" data-testid="reconcile">
      <h2 className="stp-detail-title">Conciliar com o provedor</h2>
      <p className="stp-muted">
        Confere os pagamentos dos últimos dias com o provedor: pega reembolso, contestação e webhook
        perdido. Rode depois de restaurar um backup ou quando um VIP pago não apareceu.
      </p>
      <form className="stp-form" onSubmit={submit} noValidate data-testid="reconcile-form">
        <label className="stp-label" htmlFor={`${id}-days`}>
          Dias para olhar
          <span className="stp-label-count">1 a 400</span>
        </label>
        <input
          id={`${id}-days`}
          className="stp-input stp-input-narrow"
          type="number"
          inputMode="numeric"
          min={1}
          max={400}
          value={days}
          aria-invalid={error ? true : undefined}
          onChange={(event) => setDays(event.target.value)}
          data-testid="reconcile-days"
        />
        {error ? (
          <p className="stp-field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="stp-form-actions">
          <button
            type="submit"
            className="stp-btn"
            disabled={pending}
            aria-busy={pending || undefined}
            data-testid="reconcile-submit"
          >
            Conciliar agora
          </button>
        </div>
        <p className="stp-muted" role="status" data-testid="reconcile-result">
          {done}
        </p>
      </form>
    </div>
  );
}

function Compensation({
  overview,
  defaultKey,
}: {
  overview: StaffCompensationOverview;
  defaultKey: string;
}) {
  const id = useId();
  const router = useRouter();
  const [days, setDays] = useState('1');
  const [key, setKey] = useState(defaultKey);
  const daysValue = Number(days);
  const keyValue = key.trim();
  const { activeVips } = overview;

  return (
    <div className="stp-card stp-ops-card" data-testid="compensation">
      <h2 className="stp-detail-title">Compensar por indisponibilidade</h2>
      <p className="stp-muted">
        Quando os servidores ou os benefícios do VIP ficam fora por mais de 24 horas, soma os mesmos
        dias a todos os VIPs ativos de uma vez (D4). A chave é única por queda: repetir a mesma não
        soma de novo.
      </p>
      <p data-testid="compensation-active">
        <b>{activeVips}</b>{' '}
        {activeVips === 1 ? 'Conta com VIP ativo agora' : 'Contas com VIP ativo agora'}
        {activeVips > 0 ? ' vão ganhar os dias.' : '.'}
      </p>
      {activeVips > 0 ? (
        <ActionForm
          label="Compensar VIPs ativos"
          submitLabel="Compensar"
          doneLabel="Compensação aplicada. O alerta foi enviado ao Discord."
          testId="compensation-form"
          kind="danger"
          validate={() => {
            if (
              !Number.isInteger(daysValue) ||
              daysValue < 1 ||
              daysValue > COMPENSATION_MAX_DAYS
            ) {
              return {
                message: `Os dias vão de 1 a ${COMPENSATION_MAX_DAYS}.`,
                fieldId: `${id}-days`,
              };
            }
            return KEY_PATTERN.test(keyValue)
              ? null
              : {
                  message: 'A chave tem de 3 a 80 caracteres: só letras, números e . _ : -',
                  fieldId: `${id}-key`,
                };
          }}
          confirmation={{
            title: 'Compensar todos os VIPs ativos?',
            body: () =>
              `Vai somar ${daysValue} dia(s) de VIP a ${activeVips} ${activeVips === 1 ? 'Conta' : 'Contas'} com VIP ativo agora, com a chave "${keyValue}". Não tem volta: depois de aplicada, a chave não se repete e o alerta vai para o Discord.`,
            confirmLabel: 'Compensar agora',
          }}
          onSubmit={(reason) =>
            staffPost(
              '/api/staff/payments/compensation',
              { days: daysValue, key: keyValue, reason },
              (json) => staffCompensationResultSchema.parse(json),
            )
          }
          onSuccess={() => router.refresh()}
        >
          <label className="stp-label" htmlFor={`${id}-days`}>
            Dias a somar
            <span className="stp-label-count">1 a {COMPENSATION_MAX_DAYS}</span>
          </label>
          <input
            id={`${id}-days`}
            className="stp-input stp-input-narrow"
            type="number"
            inputMode="numeric"
            min={1}
            max={COMPENSATION_MAX_DAYS}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            data-testid="compensation-days"
          />
          <label className="stp-label" htmlFor={`${id}-key`}>
            Chave da queda
            <span className="stp-label-count">ex.: queda-2026-10-27</span>
          </label>
          <input
            id={`${id}-key`}
            className="stp-input stp-mono"
            value={key}
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setKey(event.target.value)}
            data-testid="compensation-key"
          />
        </ActionForm>
      ) : null}

      <h3 className="stp-section">Últimas compensações</h3>
      {overview.recent.length === 0 ? (
        <p className="stp-muted">Nenhuma compensação ainda.</p>
      ) : (
        <ol className="stp-timeline" data-testid="compensation-recent">
          {overview.recent.map((entry) => (
            <li key={`${entry.key}-${entry.createdAt}`} className="stp-tl">
              <time dateTime={entry.createdAt}>{stamp(entry.createdAt)}</time>
              <div>
                <b>
                  {entry.days} dia(s) para {entry.accounts} Conta(s)
                </b>
                <span>
                  <span className="stp-mono">{entry.key}</span> ·{' '}
                  {entry.actorName ?? entry.actorSteamId}: {entry.reason}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
