'use client';

import { PAYMENT_STATUSES, type PaymentStatus } from '@carmine/contracts/payments';
import {
  type StaffPaymentFilter,
  type StaffPaymentPage,
  type StaffPaymentSummary,
  staffPaymentPageSchema,
} from '@carmine/contracts/staff-payments';
import Link from 'next/link';
import { useState } from 'react';
import { StatusDot, stamp } from '@/components/queue/bits';
import { CaseBoard, type Column } from '@/components/queue/case-board';
import { DetailPane, useWide } from '@/components/queue/detail-pane';
import {
  formatBrl,
  METHOD_LABEL,
  packageLabel,
  STATUS_LABEL,
  shortId,
  statusTone,
  TAB_LABEL,
} from '@/lib/payments';
import { staffGet } from '@/lib/staff-request';
import { PaymentDetail } from './payment-detail';

type Key = 'payment' | 'account' | 'package' | 'amount' | 'when';

export const FILTERS: StaffPaymentFilter[] = ['all', ...PAYMENT_STATUSES];

const NO_ONE_LEAVING: ReadonlySet<string> = new Set();

/**
 * Os pagamentos de Pacotes VIP no painel (S25), só para Dono e Admin (`payments.manage`): a lista por estado, com a
 * contagem de cada aba (sempre o total, não só a página), e a ficha ao lado com o provedor, os webhooks, o que a Staff já
 * fez e as ações (reembolsar, reabrir as compras). Do Pagador a lista e a ficha mostram só o que o contrato entrega: o
 * nome e o fim do CPF, nunca o número inteiro (ADR 0023).
 */
export function PaymentsScreen({
  initial,
  filter,
}: {
  initial: StaffPaymentPage;
  filter: StaffPaymentFilter;
}) {
  const wide = useWide();
  const [payments, setPayments] = useState<StaffPaymentSummary[]>(initial.payments);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = payments.find((payment) => payment.id === selectedId) ?? null;
  const total = Object.values(initial.counts).reduce((sum, count) => sum + count, 0);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    const page = await staffGet(
      `/api/staff/payments?${new URLSearchParams({ status: filter, before: cursor })}`,
      (value) => staffPaymentPageSchema.parse(value),
    );
    if (page) {
      setPayments((current) => [...current, ...page.payments]);
      setCursor(page.nextCursor);
    } else {
      setFailed(true);
    }
    setLoading(false);
  };

  /** Reembolsar muda o estado e o devolvido; reabrir as compras tira o aviso de todas as linhas da Conta. */
  const patch = (next: StaffPaymentSummary) =>
    setPayments((current) =>
      current.map((payment) =>
        payment.id === next.id
          ? next
          : payment.account.publicId === next.account.publicId
            ? { ...payment, account: next.account }
            : payment,
      ),
    );

  const columns: Column<StaffPaymentSummary, Key>[] = [
    {
      key: 'payment',
      label: 'Pagamento',
      sortable: true,
      render: (item) => (
        <span>
          <span className="stp-cell-main">
            <StatusDot tone={statusTone(item.status)}>{STATUS_LABEL[item.status]}</StatusDot>
          </span>
          <span className="stp-cell-sub stp-mono">{shortId(item.id)}</span>
        </span>
      ),
    },
    {
      key: 'account',
      label: 'Conta',
      sortable: true,
      render: (item) => (
        <span>
          <span className="stp-cell-main">{item.account.displayName}</span>
          <span className="stp-cell-sub">
            #{item.account.publicId}
            {item.account.purchasesBlocked ? ' · compras bloqueadas' : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'package',
      label: 'Pacote',
      sortable: true,
      render: (item) => `${packageLabel(item.days)} · ${METHOD_LABEL[item.method]}`,
    },
    {
      key: 'amount',
      label: 'Valor',
      sortable: true,
      render: (item) => (
        <span>
          <span className="stp-cell-main">{formatBrl(item.amountCents)}</span>
          {item.refundedCents > 0 ? (
            <span className="stp-cell-sub">devolvido {formatBrl(item.refundedCents)}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'when',
      label: 'Criado em',
      sortable: true,
      render: (item) => <time dateTime={item.createdAt}>{stamp(item.createdAt)}</time>,
    },
  ];

  const sortValue = (item: StaffPaymentSummary, key: Key): string | number | null => {
    switch (key) {
      case 'payment':
        return STATUS_LABEL[item.status];
      case 'account':
        return item.account.displayName.toLowerCase();
      case 'package':
        return item.days;
      case 'amount':
        return item.amountCents;
      case 'when':
        return new Date(item.createdAt).getTime();
    }
  };

  return (
    <div className="stp-page" data-testid="stp-payments">
      <div className="stp-head">
        <div>
          <h1>Pagamentos</h1>
          <p>
            Os pagamentos de Pacotes VIP: o estado de cada um, o que o provedor disse e o que dá
            para fazer. Do Pagador, só o nome e o fim do CPF.
          </p>
        </div>
      </div>

      <nav className="stp-tabs-pill" aria-label="Estado do pagamento">
        {FILTERS.map((option) => {
          const count = option === 'all' ? total : (initial.counts[option as PaymentStatus] ?? 0);
          return (
            <Link
              key={option}
              href={option === 'all' ? '/pagamentos' : `/pagamentos?status=${option}`}
              prefetch={false}
              className="stp-pilltab"
              aria-current={option === filter ? 'page' : undefined}
              data-testid={`stp-tab-${option}`}
            >
              {TAB_LABEL[option]}
              <small>{count}</small>
            </Link>
          );
        })}
      </nav>

      <div className="stp-layout" data-detail={wide && selected ? '' : undefined}>
        <CaseBoard<StaffPaymentSummary, Key>
          testId="stp-payment-board"
          caption="Pagamentos, ordenáveis pelo cabeçalho"
          items={payments}
          getId={(item) => item.id}
          searchText={(item) =>
            `${item.id} ${item.account.displayName} ${item.account.publicId} ${item.payerName ?? ''} ${STATUS_LABEL[item.status]}`
          }
          searchPlaceholder="Buscar por Conta, ID, Pagador ou estado"
          columns={columns}
          sortValue={sortValue}
          defaultSort={{ key: 'when', dir: -1 }}
          selectedId={selectedId}
          onSelect={setSelectedId}
          renderCard={(item) => (
            <>
              <span className="stp-card-row-top">
                <b>{item.account.displayName}</b>
                <StatusDot tone={statusTone(item.status)}>{STATUS_LABEL[item.status]}</StatusDot>
              </span>
              <span className="stp-card-row-meta">
                <span>
                  {formatBrl(item.amountCents)} · {packageLabel(item.days)} ·{' '}
                  {METHOD_LABEL[item.method]}
                </span>
                <time dateTime={item.createdAt}>{stamp(item.createdAt)}</time>
              </span>
            </>
          )}
          leaving={NO_ONE_LEAVING}
          loadMore={{ available: cursor !== null, loading, failed, onLoad: loadMore }}
          emptyTitle="Nenhum pagamento neste estado"
          emptyText="Quando houver, ele aparece aqui, do mais recente ao mais antigo."
        />

        <DetailPane
          open={selected !== null}
          onClose={() => setSelectedId(null)}
          label={selected ? `Pagamento ${shortId(selected.id)}` : 'Pagamento'}
        >
          {selected ? (
            <PaymentDetail
              key={selected.id}
              summary={selected}
              onClose={() => setSelectedId(null)}
              onChange={patch}
            />
          ) : null}
        </DetailPane>
      </div>
    </div>
  );
}
