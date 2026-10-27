'use client';

import { type FakePayment, fakePaymentSchema } from '@carmine/contracts/payments';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import { useSession } from '@/components/session/session-provider';
import { Button } from '@/components/ui/button';
import {
  ACTION_HINT,
  ACTION_LABEL,
  availableActions,
  backToPurchase,
  formatCents,
  STATUS_LABEL,
} from '@/lib/vip/simulation';

/** O POST de uma ação devolve a cobrança sem a lista de ações. */
const resultSchema = fakePaymentSchema.omit({ actions: true });

/**
 * O painel do provedor falso: a cobrança (valor, método, estado) e as ações que valem agora. Cada ação é um `POST` em
 * `/api/dev/payments/{providerId}/{ação}`; a resposta traz a cobrança já atualizada e o link para voltar à compra.
 */
export function SimulationPanel({
  providerId,
  initial,
}: {
  providerId: string;
  initial: FakePayment;
}) {
  // Quem está logado manda o token CSRF em toda mutação (a API o exige com sessão, mesmo nesta rota): o `mutate` da sessão o leva.
  const { mutate } = useSession();
  const [payment, setPayment] = useState<Omit<FakePayment, 'actions'>>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const actions = availableActions(payment.status).filter((action) =>
    initial.actions.includes(action),
  );

  async function run(action: (typeof actions)[number]) {
    if (busy) return;
    setBusy(action);
    setError(false);
    try {
      const response = await mutate(`/api/dev/payments/${providerId}/${action}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(String(response.status));
      setPayment(resultSchema.parse(await response.json()));
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="container-page max-w-[720px] pt-12 pb-24" data-testid="fake-provider">
      <p className="v-label text-muted-foreground">Ambiente de teste</p>
      <h1 className="mt-2 text-display max-md:text-[26px]">Provedor de pagamento falso</h1>
      <p className="mt-2 max-w-[56ch] text-body-sm text-muted-foreground">
        Faz o papel do banco e do checkout do cartão: ninguém é cobrado. Escolha o que acontece com
        esta cobrança e volte para a compra.
      </p>

      <section
        aria-label="Cobrança"
        className="mt-8 grid gap-3 rounded-[28px] bg-surface p-6 max-md:p-5"
      >
        <dl className="grid gap-2 text-[15px]">
          <Row label="Estado">
            <b data-testid="fake-status" data-status={payment.status}>
              {STATUS_LABEL[payment.status]}
            </b>
          </Row>
          <Row label="Valor">
            <span className="tabular-nums" data-testid="fake-amount">
              {formatCents(payment.amountCents)}
            </span>
          </Row>
          {payment.refundedCents > 0 ? (
            <Row label="Reembolsado">
              <span className="tabular-nums">{formatCents(payment.refundedCents)}</span>
            </Row>
          ) : null}
          <Row label="Método">{payment.method === 'pix' ? 'Pix' : 'Cartão'}</Row>
          <Row label="Cobrança">
            <code className="break-all text-[13px]">{payment.providerPaymentId}</code>
          </Row>
        </dl>
      </section>

      {actions.length > 0 ? (
        <section aria-label="Ações" className="mt-4 grid gap-2.5">
          {actions.map((action) => (
            <div key={action} className="grid gap-1 rounded-[22px] bg-(--fill-rest) p-4">
              <Button
                type="button"
                disabled={busy !== null}
                onClick={() => run(action)}
                data-testid={`fake-action-${action}`}
              >
                {busy === action ? 'Enviando' : ACTION_LABEL[action]}
              </Button>
              <p className="px-1 text-[13.5px] text-muted-foreground">{ACTION_HINT[action]}</p>
            </div>
          ))}
        </section>
      ) : (
        <p className="mt-4 text-body-sm text-muted-foreground" data-testid="fake-no-actions">
          Não há mais nada a fazer nesta cobrança.
        </p>
      )}

      {error ? (
        <p role="alert" className="mt-4 text-[14.5px] font-semibold" data-testid="fake-error">
          Não deu certo. Tente de novo.
        </p>
      ) : null}

      <p className="mt-8 text-[15px]">
        <Link
          href={backToPurchase(payment.externalReference, payment.method) as Route}
          prefetch={false}
          className="font-semibold underline underline-offset-4"
          data-testid="fake-back"
        >
          Voltar para a compra
        </Link>
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-foreground/10 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
