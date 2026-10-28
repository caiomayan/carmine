import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MercadoPagoClient } from './mercadopago-client.js';
import { MercadoPagoGateway } from './mercadopago-gateway.js';

/**
 * O teste de CONTRATO do adaptador do Mercado Pago contra o sandbox de verdade (S14c). Só roda com
 * `MP_SANDBOX_ACCESS_TOKEN` (o Access Token de TESTE da aplicação: Suas integrações > aplicação > seletor "Teste" >
 * Credenciais); sem ele, o arquivo inteiro é pulado, e é o que acontece na CI hoje. Não paga nada: o que só se prova
 * com pagamento aprovado (concessão pelo webhook, reembolso, contestação) está listado em
 * docs/operacao/mercadopago.md, "O que só o sandbox prova".
 *
 * Como rodar:
 *   MP_SANDBOX_ACCESS_TOKEN=APP_USR-... pnpm --filter @carmine/api exec vitest run --project unit mercadopago.contract
 * `MP_SANDBOX_PAYER_EMAIL_DOMAIN` troca o domínio do e-mail do pagador (padrão `example.com`).
 */
const token = process.env.MP_SANDBOX_ACCESS_TOKEN;

describe.skipIf(!token)('contrato com o sandbox do Mercado Pago', () => {
  const gateway = new MercadoPagoGateway({
    client: new MercadoPagoClient({ accessToken: token ?? '' }),
    // O segredo do webhook não entra aqui: a assinatura se prova offline (mercadopago.spec.ts).
    webhookSecret: 'nao-usado-neste-teste',
    payerEmailDomain: process.env.MP_SANDBOX_PAYER_EMAIL_DOMAIN ?? 'example.com',
  });
  const input = (paymentId: string, method: 'pix' | 'card') => ({
    paymentId,
    amountCents: 990,
    method,
    description: 'Saint Carmine · teste de contrato',
    expiresAt: new Date(Date.now() + 35 * 60 * 1000),
    backUrl: `https://stcarmine.com/vip/compra/${paymentId}?retorno=cartao`,
  });

  it('Pix: cria a cobrança, devolve o QR e o copia e cola, e a consulta a vê pendente com a nossa referência', async () => {
    const paymentId = randomUUID();

    const charge = await gateway.createCharge(input(paymentId, 'pix'));

    expect(charge.pix?.copyPaste).toMatch(/^0002/);
    expect(charge.pix?.qrCodeBase64).toBeTruthy();
    const payment = await gateway.getPayment(charge.providerPaymentId);
    expect(payment).toMatchObject({
      providerPaymentId: charge.providerPaymentId,
      externalReference: paymentId,
      status: 'pending',
      amountCents: 990,
      method: 'pix',
      refundedCents: 0,
    });

    // E cancela o pendente: o estado volta como cancelado (ou vencido).
    await gateway.cancelCharge(charge.providerPaymentId);
    const after = await gateway.getPayment(charge.providerPaymentId);
    expect(['cancelled', 'expired']).toContain(after?.status);
  });

  it('cartão: cria a preferência do Checkout Pro e devolve o link; ainda não há pagamento para consultar', async () => {
    const paymentId = randomUUID();

    const charge = await gateway.createCharge(input(paymentId, 'card'));

    expect(charge.providerPaymentId).toBe(`ref:${paymentId}`);
    expect(charge.redirectUrl).toMatch(/^https:\/\/.*mercadopago\./);
    expect(await gateway.getPayment(charge.providerPaymentId)).toBeNull();
  });
});
