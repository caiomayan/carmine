'use client';

import {
  type StaffPaymentDetail,
  type StaffPaymentSummary,
  staffPaymentDetailSchema,
  staffPurchasesUnblockedSchema,
} from '@carmine/contracts/staff-payments';
import { XIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import { AUDIT_ACTION_LABEL } from '@/components/audit/audit-entries';
import { ActionForm } from '@/components/queue/action-form';
import { StatusDot, stamp } from '@/components/queue/bits';
import {
  formatBrl,
  METHOD_LABEL,
  OUTCOME_LABEL,
  outcomeTone,
  packageLabel,
  refundPreviewCents,
  STATUS_LABEL,
  shortId,
  stampLong,
  statusTone,
} from '@/lib/payments';
import { staffGet, staffPost } from '@/lib/staff-request';

const NONE = '—';
const date = (iso: string | null) => (iso ? stampLong(iso) : NONE);

/**
 * A ficha de um pagamento: valores, Conta e Pagador (o CPF só mascarado), provedor, os webhooks recebidos e o que a Staff
 * já fez, mais reembolsar e reabrir as compras. A ficha é buscada ao abrir (os webhooks e o provedor só vêm dela) e as
 * ações devolvem a ficha atualizada.
 */
export function PaymentDetail({
  summary,
  onClose,
  onChange,
}: {
  summary: StaffPaymentSummary;
  onClose: () => void;
  onChange: (next: StaffPaymentSummary) => void;
}) {
  const id = useId();
  const [detail, setDetail] = useState<StaffPaymentDetail | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const result = await staffGet(`/api/staff/payments/${summary.id}`, (value) =>
      staffPaymentDetailSchema.parse(value),
    );
    setFailed(result === null);
    if (result) setDetail(result);
    return result;
  }, [summary.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = (next: StaffPaymentDetail) => {
    setDetail(next);
    onChange(next.payment);
  };

  const payment = detail?.payment ?? summary;

  return (
    <>
      <div className="stp-detail-top">
        <h2 className="stp-detail-title">Pagamento {shortId(payment.id)}</h2>
        <button type="button" className="stp-round" aria-label="Fechar o detalhe" onClick={onClose}>
          <XIcon size={16} aria-hidden="true" />
        </button>
      </div>

      <p data-testid="payment-status">
        <StatusDot tone={statusTone(payment.status)}>{STATUS_LABEL[payment.status]}</StatusDot>
      </p>
      {payment.account.purchasesBlocked ? (
        <p className="stp-muted" data-testid="payment-blocked">
          As compras desta Conta estão bloqueadas por contestação.
        </p>
      ) : null}

      <dl className="stp-dl">
        <dt>Valor</dt>
        <dd>{formatBrl(payment.amountCents)}</dd>
        <dt>Pacote</dt>
        <dd>
          {packageLabel(payment.days)} <span className="stp-muted">({payment.package})</span>
        </dd>
        <dt>Meio</dt>
        <dd>{METHOD_LABEL[payment.method]}</dd>
        <dt>Criado em</dt>
        <dd>{date(payment.createdAt)}</dd>
        <dt>Aprovado em</dt>
        <dd>{date(payment.approvedAt)}</dd>
        <dt>Devolvido</dt>
        <dd>
          {payment.refundedCents > 0
            ? `${formatBrl(payment.refundedCents)}${detail ? ` (${detail.refundedDays} d)` : ''}`
            : NONE}
        </dd>
        <dt>Conta</dt>
        <dd>
          <Link
            className="stp-link"
            href={`/contas/${payment.account.publicId}`}
            prefetch={false}
            data-testid="payment-account"
          >
            {payment.account.displayName}
          </Link>{' '}
          <span className="stp-muted">#{payment.account.publicId}</span>
        </dd>
        <dt>Pagador</dt>
        <dd>{payment.payerName ?? NONE}</dd>
        <dt>CPF</dt>
        <dd className="stp-mono" data-testid="payment-cpf">
          {payment.payerDocumentMasked ?? NONE}
        </dd>
        <dt>Provedor</dt>
        <dd>{payment.provider}</dd>
      </dl>

      {failed ? (
        <p className="stp-field-error" role="alert">
          Não deu para abrir a ficha agora.{' '}
          <button type="button" className="stp-link" onClick={() => void load()}>
            Tentar de novo
          </button>
        </p>
      ) : detail ? (
        <DetailBody detail={detail} sectionId={id} onChange={apply} reload={load} />
      ) : (
        <p className="stp-muted" role="status">
          Carregando a ficha…
        </p>
      )}
    </>
  );
}

function DetailBody({
  detail,
  sectionId,
  onChange,
  reload,
}: {
  detail: StaffPaymentDetail;
  sectionId: string;
  onChange: (next: StaffPaymentDetail) => void;
  reload: () => Promise<StaffPaymentDetail | null>;
}) {
  const [days, setDays] = useState('');
  const { purchaseBlock } = detail;
  // Depois do reembolso a API diz que não há mais o que devolver; o painel guarda o que havia ao abrir para o aviso "Reembolso feito" não sumir.
  const [refundable] = useState(detail.refundable);
  const stillRefundable = detail.refundable !== null;
  const daysValue = days.trim() === '' ? undefined : Number(days);

  return (
    <>
      <dl className="stp-dl">
        <dt>Id no provedor</dt>
        <dd className="stp-mono">{detail.providerPaymentId ?? NONE}</dd>
        <dt>Vence em</dt>
        <dd>{date(detail.expiresAt)}</dd>
        <dt>VIP até</dt>
        <dd>{date(detail.vipEndsAt)}</dd>
        {detail.chargedBackAt ? (
          <>
            <dt>Contestado em</dt>
            <dd>{date(detail.chargedBackAt)}</dd>
          </>
        ) : null}
        {detail.failureReason ? (
          <>
            <dt>Falha</dt>
            <dd>{detail.failureReason}</dd>
          </>
        ) : null}
        <dt>Maioridade</dt>
        <dd>
          declarada em {date(detail.adultDeclaredAt)}, texto de {detail.declarationVersion}
        </dd>
        <dt>Identificador</dt>
        <dd className="stp-mono">{detail.payment.id}</dd>
      </dl>

      {purchaseBlock ? (
        <section aria-labelledby={`${sectionId}-block`} data-testid="unblock-panel">
          <h3 id={`${sectionId}-block`} className="stp-section">
            Compras bloqueadas
          </h3>
          <p>
            A Conta está com as compras bloqueadas desde {date(purchaseBlock.at)} (contestação de
            pagamento). Reabra só depois de revisar.
          </p>
          {purchaseBlock.reason ? (
            <p className="stp-muted">Motivo do bloqueio: {purchaseBlock.reason}</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby={`${sectionId}-hooks`}>
        <h3 id={`${sectionId}-hooks`} className="stp-section">
          Webhooks recebidos
        </h3>
        {detail.events.length === 0 ? (
          <p className="stp-muted" data-testid="events-empty">
            Nenhum webhook recebido para este pagamento.
          </p>
        ) : (
          <ol className="stp-timeline" data-testid="payment-events">
            {detail.events.map((event) => (
              <li key={event.id} className="stp-tl" data-outcome={event.outcome}>
                <time dateTime={event.receivedAt}>{stamp(event.receivedAt)}</time>
                <div>
                  <b>
                    <StatusDot tone={outcomeTone(event.outcome)}>
                      {OUTCOME_LABEL[event.outcome] ?? event.outcome}
                    </StatusDot>
                  </b>
                  <span>
                    {event.topic ?? NONE} · assinatura{' '}
                    {event.signatureValid ? 'válida' : 'inválida'}
                    {event.detail ? ` · ${event.detail}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby={`${sectionId}-audit`}>
        <h3 id={`${sectionId}-audit`} className="stp-section">
          O que a Staff fez
        </h3>
        {detail.audit.length === 0 ? (
          <p className="stp-muted" data-testid="payment-audit-empty">
            Nenhuma ação da Staff neste pagamento.
          </p>
        ) : (
          <ol className="stp-timeline" data-testid="payment-audit">
            {detail.audit.map((entry) => (
              <li key={entry.id} className="stp-tl" data-action={entry.action}>
                <time dateTime={entry.createdAt}>{stamp(entry.createdAt)}</time>
                <div>
                  <b>{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</b>
                  <span>
                    {entry.actorName ?? entry.actorSteamId}: {entry.reason}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="stp-detail-foot">
        {refundable ? (
          <div data-testid="refund-panel">
            <p className="stp-muted">
              Devolve pelo provedor e tira os dias do VIP. Dentro dos 7 dias a própria pessoa faz em
              Minhas compras; aqui é depois dos 7 dias ou parcial, por indisponibilidade.
            </p>
            {stillRefundable ? (
              <p data-testid="refundable">
                Ainda dá para devolver <b>{refundable.days} dia(s)</b>, até{' '}
                <b>{formatBrl(refundable.cents)}</b>.
              </p>
            ) : null}
            <ActionForm
              label="Reembolsar este pagamento"
              submitLabel="Reembolsar"
              doneLabel="Reembolso feito. A ficha foi atualizada."
              testId="refund-form"
              kind="danger"
              validate={() =>
                daysValue === undefined ||
                (Number.isInteger(daysValue) && daysValue >= 1 && daysValue <= refundable.days)
                  ? null
                  : {
                      message: `Os dias vão de 1 a ${refundable.days}, ou deixe em branco.`,
                      fieldId: `${sectionId}-days`,
                    }
              }
              confirmation={{
                title: 'Reembolsar este pagamento?',
                body: () => {
                  const d = daysValue ?? refundable.days;
                  const cents =
                    daysValue === undefined
                      ? refundable.cents
                      : refundPreviewCents(
                          detail.payment.amountCents,
                          detail.payment.days,
                          daysValue,
                          refundable.cents,
                        );
                  return `O provedor devolve até ${formatBrl(cents)}, referentes a ${d} dia(s), e os dias saem do VIP da Conta. O valor exato é o que a API calcula. Não tem volta.`;
                },
                confirmLabel: 'Reembolsar agora',
              }}
              onCancel={() => setDays('')}
              onSubmit={(reason) =>
                staffPost(
                  `/api/staff/payments/${detail.payment.id}/refund`,
                  { reason, ...(daysValue !== undefined && { days: daysValue }) },
                  (value) => staffPaymentDetailSchema.parse(value),
                )
              }
              onSuccess={(next) => {
                setDays('');
                onChange(next);
              }}
            >
              <label className="stp-label" htmlFor={`${sectionId}-days`}>
                Dias a devolver
                <span className="stp-label-count">em branco devolve o que resta</span>
              </label>
              <input
                id={`${sectionId}-days`}
                className="stp-input stp-input-narrow"
                type="number"
                inputMode="numeric"
                min={1}
                max={refundable.days}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                data-testid="refund-days"
              />
            </ActionForm>
          </div>
        ) : (
          <p className="stp-muted" data-testid="refund-unavailable">
            Não há o que devolver agora: só se reembolsa pagamento aprovado, com dias a devolver.
          </p>
        )}

        {purchaseBlock ? (
          <ActionForm
            label="Reabrir as compras"
            submitLabel="Reabrir"
            doneLabel="Compras reabertas."
            testId="unblock-form"
            onSubmit={(reason) =>
              staffPost(
                `/api/staff/accounts/${detail.payment.account.publicId}/purchases/unblock`,
                { reason },
                (value) => staffPurchasesUnblockedSchema.parse(value),
              )
            }
            onSuccess={() => void reload().then((next) => next && onChange(next))}
          />
        ) : null}
      </div>
    </>
  );
}
