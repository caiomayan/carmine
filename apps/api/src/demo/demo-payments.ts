import { ADULT_DECLARATION_VERSION, type CreatePurchase } from '@carmine/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { payments } from '../database/schema.js';
import { type FakeAction, FakePaymentsGateway } from '../payments/fake-gateway.js';
import type { Payments } from '../payments/payments.js';

export interface PaymentSeedServices {
  payments: Payments;
  /** O gateway de mentira, ou outro (nesse caso o seed não semeia: só o falso paga sozinho). */
  gateway: unknown;
}

/** Os três pagamentos de demonstração: o desfecho de cada um é o que o QA da ficha precisa ver. */
export const DEMO_PAYMENT_SCENARIOS = [
  { key: 'demo-pagamento-aprovado', package: 'vip-1m', method: 'pix', outcome: 'approved' },
  {
    key: 'demo-pagamento-reembolso-parcial',
    package: 'vip-3m',
    method: 'pix',
    outcome: 'partially_refunded',
    /** Dias que a Staff devolve (de 90): o reembolso parcial. */
    refundDays: 30,
  },
  {
    key: 'demo-pagamento-contestado',
    package: 'padrinho-1m',
    method: 'pix',
    outcome: 'charged_back',
  },
] as const satisfies ReadonlyArray<{
  key: string;
  package: CreatePurchase['package'];
  method: CreatePurchase['method'];
  outcome: 'approved' | 'partially_refunded' | 'charged_back';
  refundDays?: number;
}>;

/**
 * Semeia três pagamentos de demonstração pelo CAMINHO DE VERDADE (a compra, o provedor falso com o
 * webhook assinado, o reembolso da Staff), não por linhas soltas: um aprovado, um reembolsado
 * parcialmente pela Staff e um contestado (que bloqueia as compras da Conta). O CPF vem do pagador
 * do falso (`FAKE_PAYER`, de teste, válido só no formato) e é guardado cifrado, como o de verdade.
 *
 * Idempotente: cada cenário tem uma chave de idempotência fixa, então rodar de novo não cria outro
 * pagamento e só completa o que ficou no meio do caminho. Sem o dono (o reembolso precisa de um autor
 * da Staff), sem a cobrança ligada ou com outro provedor que não o falso, não semeia. Só roda dentro
 * do `seedDemo`, que já passou pela trava da homologação.
 */
export async function seedDemoPayments(
  db: Database,
  services: PaymentSeedServices,
  accountIds: readonly string[],
  author: { steamId: string } | null,
  now: Date,
  log: (line: string) => void,
): Promise<void> {
  const { payments: service, gateway } = services;
  if (!(gateway instanceof FakePaymentsGateway)) {
    return log('pagamentos: o provedor não é o falso, não semeou');
  }
  if (!service.available) return log('pagamentos: a cobrança está desligada, não semeou');
  if (author === null) return log('pagamentos: sem DEMO_OWNER_STEAM_ID, não semeou');
  if (accountIds.length < DEMO_PAYMENT_SCENARIOS.length) {
    throw new Error('Faltam Contas para os pagamentos de demonstração');
  }

  const staff = { actorSteamId: author.steamId, reason: 'Homologação: pagamento de exemplo' };
  let touched = 0;
  for (const [index, scenario] of DEMO_PAYMENT_SCENARIOS.entries()) {
    const accountId = accountIds[index] as string;
    const done = await advance(db, service, gateway, accountId, scenario, staff, now);
    if (done) touched += 1;
  }
  log(
    `pagamentos: ${touched} novo(s) de ${DEMO_PAYMENT_SCENARIOS.length} (aprovado, reembolso parcial, contestado)`,
  );
}

/** Leva um cenário ao desfecho, retomando de onde parou. Devolve se mexeu em algo. */
async function advance(
  db: Database,
  service: Payments,
  gateway: FakePaymentsGateway,
  accountId: string,
  scenario: (typeof DEMO_PAYMENT_SCENARIOS)[number],
  staff: { actorSteamId: string; reason: string },
  now: Date,
): Promise<boolean> {
  const find = async () => {
    const [row] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.accountId, accountId), eq(payments.idempotencyKey, scenario.key)));
    return row;
  };
  let row = await find();
  if (row && isSettled(row.status, scenario.outcome)) return false;

  if (!row) {
    await service.create(
      accountId,
      {
        package: scenario.package,
        method: scenario.method,
        adultDeclaration: true,
        declarationVersion: ADULT_DECLARATION_VERSION,
      },
      scenario.key,
      now,
    );
    row = await find();
  }
  if (!row?.providerPaymentId)
    throw new Error(`Pagamento ${scenario.key} sem cobrança no provedor`);

  const act = async (action: FakeAction) => {
    if (!(await gateway.act(row?.providerPaymentId as string, action))) {
      throw new Error(`Pagamento ${scenario.key}: a cobrança sumiu do provedor falso`);
    }
    row = await find();
  };

  if (row?.status === 'pending') await act('pay');
  if (scenario.outcome === 'partially_refunded' && row?.status === 'approved') {
    await service.refundByStaff(row.id, staff, { days: scenario.refundDays }, now);
  }
  if (scenario.outcome === 'charged_back' && row?.status === 'approved') await act('chargeback');
  return true;
}

function isSettled(status: string, outcome: (typeof DEMO_PAYMENT_SCENARIOS)[number]['outcome']) {
  return status === outcome;
}
