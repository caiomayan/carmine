import { expect, type Page } from '@playwright/test';
import { csrfToken } from './accounts';

/** O que os E2E leem de uma compra (o resto do contrato fica na API). */
export interface E2ePurchase {
  id: string;
  status: string;
  package: string;
  amountCents: number;
  method: 'pix' | 'card';
  pix: { copyPaste: string; qrCodeBase64: string | null } | null;
  redirectUrl: string | null;
  simulationUrl: string | null;
  payerName: string | null;
  payerDocumentMasked: string | null;
  periodEndsAt: string | null;
  refundableUntil: string | null;
}

/** Compra um Pacote VIP para a Conta logada, pela API (o provedor é o falso do E2E). */
export async function createPurchase(
  page: Page,
  options: { package?: 'vip-1m' | 'vip-3m' | 'vip-6m'; method?: 'pix' | 'card' } = {},
): Promise<E2ePurchase> {
  const response = await page.request.post('/api/me/purchases', {
    headers: { 'x-csrf-token': await csrfToken(page.context()) },
    data: {
      package: options.package ?? 'vip-1m',
      method: options.method ?? 'pix',
      adultDeclaration: true,
      declarationVersion: 'e2e',
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as E2ePurchase;
}

/** O que a página de simulação do provedor falso faz com a cobrança (ela dispara o webhook assinado de verdade). */
export async function simulate(
  page: Page,
  purchase: E2ePurchase,
  action: 'pay' | 'reject' | 'expire' | 'refund' | 'chargeback',
) {
  const providerId = purchase.simulationUrl?.split('/').pop();
  if (!providerId) throw new Error('compra sem simulationUrl: o provedor não é o falso?');
  // Com sessão no navegador, até a rota de simulação pede o token CSRF (toda mutação de quem tem cookie).
  const response = await page.request.post(`/api/dev/payments/${providerId}/${action}`, {
    headers: { 'x-csrf-token': await csrfToken(page.context()) },
  });
  expect(response.ok(), await response.text()).toBe(true);
}
