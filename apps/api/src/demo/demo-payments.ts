import { ADULT_DECLARATION_VERSION, type CreatePurchase } from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { payments } from '../database/schema.js';
import {
  type FakeAction,
  FakePaymentsGateway,
  type WebhookSink,
} from '../payments/fake-gateway.js';
import { Payments, type PaymentsOptions } from '../payments/payments.js';
import { DEMO_PLAYERS } from './demo-cast.js';

export interface PaymentSeedServices {
  /** O Payments do seed: SEM alerta (veja {@link createSeedPayments}). */
  payments: Payments;
  /** O gateway de mentira, ou outro (nesse caso o seed não semeia: só o falso paga sozinho). */
  gateway: unknown;
  /** O tratador de webhook que o falso tinha antes do seed; volta a ele no fim. */
  restoreSink?: WebhookSink;
}

/**
 * O Payments que o seed usa: o mesmo código da compra, do webhook e do reembolso, mas SEM o aviso ao
 * Discord. A contestação e o estorno parcial mandam alerta para a Staff; num seed de exemplo isso seria
 * ruído (ou alarme falso) no canal da homologação.
 */
export function createSeedPayments(options: Omit<PaymentsOptions, 'alert'>): Payments {
  return new Payments({ ...options, alert: undefined });
}

type Outcome = 'approved' | 'partially_refunded' | 'charged_back';

interface Scenario {
  /** Chave de idempotência fixa: é como o seed reconhece o pagamento nos deploys seguintes. */
  key: string;
  /** Nome Steam do jogador fictício comprador (fixo: mudar o elenco não troca o comprador). */
  buyer: string;
  package: CreatePurchase['package'];
  method: CreatePurchase['method'];
  outcome: Outcome;
  /** Dias que a Staff devolve (de 90): o reembolso parcial. */
  refundDays?: number;
}

/** Os três pagamentos de demonstração: o desfecho de cada um é o que o QA da ficha precisa ver. */
export const DEMO_PAYMENT_SCENARIOS: readonly Scenario[] = [
  {
    key: 'demo-pagamento-aprovado',
    buyer: 'Nebula',
    package: 'vip-1m',
    method: 'pix',
    outcome: 'approved',
  },
  {
    key: 'demo-pagamento-reembolso-parcial',
    buyer: 'k0ala',
    package: 'vip-3m',
    method: 'pix',
    outcome: 'partially_refunded',
    refundDays: 30,
  },
  {
    key: 'demo-pagamento-contestado',
    buyer: 'Bruxo',
    package: 'padrinho-1m',
    method: 'pix',
    outcome: 'charged_back',
  },
];

/**
 * Semeia três pagamentos de demonstração pelo CAMINHO DE VERDADE (a compra, o provedor falso com o
 * webhook assinado, o reembolso da Staff), não por linhas soltas: um aprovado, um reembolsado
 * parcialmente pela Staff e um contestado (que bloqueia as compras da Conta). O CPF vem do pagador
 * do falso (`FAKE_PAYER`, de teste, válido só no formato) e é guardado cifrado, como o de verdade.
 *
 * Idempotente: cada cenário tem uma chave fixa e o pagamento é achado só por ela (não pela Conta), então
 * rodar de novo, ou mudar o elenco, não cria outro; um pagamento que parou no meio é levado ao fim. Um
 * pagamento num estado fora do roteiro (estornado, recusado, vencido...) é deixado como está, com um
 * aviso no log. Sem o dono (o reembolso precisa de um autor da Staff), sem a cobrança ligada ou com
 * outro provedor que não o falso, não semeia. Só roda dentro do `seedDemo`, que já passou pela trava
 * da homologação.
 */
export async function seedDemoPayments(
  db: Database,
  services: PaymentSeedServices,
  accountIds: ReadonlyMap<string, string>,
  author: { steamId: string } | null,
  log: (line: string) => void,
): Promise<void> {
  const { payments: service, gateway } = services;
  if (!(gateway instanceof FakePaymentsGateway)) {
    return log('pagamentos: o provedor não é o falso, não semeou');
  }
  if (!service.available) return log('pagamentos: a cobrança está desligada, não semeou');
  if (author === null) return log('pagamentos: sem DEMO_OWNER_STEAM_ID, não semeou');

  const staff = { actorSteamId: author.steamId, reason: 'Homologação: pagamento de exemplo' };
  // O webhook do falso passa a cair no Payments do seed (sem alerta) enquanto o seed roda.
  gateway.attach(async (request) => {
    await service.handleWebhook(request);
  });
  try {
    let advanced = 0;
    for (const scenario of DEMO_PAYMENT_SCENARIOS) {
      const player = DEMO_PLAYERS.find((p) => p.name === scenario.buyer);
      const accountId = player ? accountIds.get(player.steamId) : undefined;
      if (!accountId) throw new Error(`Comprador ${scenario.buyer} fora do elenco de demonstração`);
      if (await advance(db, service, gateway, accountId, scenario, staff, log)) advanced += 1;
    }
    log(
      `pagamentos: ${advanced} de ${DEMO_PAYMENT_SCENARIOS.length} levados ao fim (aprovado, reembolso parcial, contestado)`,
    );
  } finally {
    if (services.restoreSink) gateway.attach(services.restoreSink);
  }
}

/** Leva um cenário ao desfecho, retomando de onde parou. Devolve se mexeu em algo. */
async function advance(
  db: Database,
  service: Payments,
  gateway: FakePaymentsGateway,
  accountId: string,
  scenario: Scenario,
  staff: { actorSteamId: string; reason: string },
  log: (line: string) => void,
): Promise<boolean> {
  const find = async () => {
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, scenario.key))
      .limit(1);
    return row;
  };
  let row = await find();
  if (row?.status === scenario.outcome) return false;
  if (row && row.status !== 'pending' && row.status !== 'approved') {
    log(`pagamentos: ${scenario.key} está em "${row.status}", fora do roteiro; não mexi`);
    return false;
  }

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
    await service.refundByStaff(row.id, staff, { days: scenario.refundDays });
  }
  if (scenario.outcome === 'charged_back' && row?.status === 'approved') await act('chargeback');
  row = await find();
  if (row?.status !== scenario.outcome) {
    log(`pagamentos: ${scenario.key} terminou em "${row?.status}", esperado "${scenario.outcome}"`);
  }
  return true;
}
