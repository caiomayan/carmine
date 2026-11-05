import { expect, type Page, test } from '@playwright/test';
import {
  chooseSteamAccount,
  createUnclaimedAccount,
  grantStaffRole,
  newSteamId,
  signInByRequest,
} from './accounts';
import { connectPlayer, createServer } from './live-servers';
import { createPurchase, simulate } from './payments-api';

/**
 * Pagamentos no painel da Staff (S25, `apps/staff`): a lista com filtro e contagem por estado, a ficha com os webhooks e o
 * CPF só mascarado, reembolsar com motivo e confirmação (total e por dias), reabrir as compras depois de uma contestação e
 * as operações em lote. Só o Dono e o Admin. O painel é outro host (porta 3200 no E2E) com a própria sessão; quem compra
 * entra no site. A compensação não é aplicada aqui: ela soma dias a TODOS os VIPs ativos e os testes compartilham o banco.
 */
const STAFF = `http://localhost:${process.env.STAFF_E2E_PORT ?? 3200}`;
const WEB = `http://localhost:${process.env.WEB_E2E_PORT ?? 3000}`;

test.use({ baseURL: STAFF });

/** O comprador, no site (outro host, outra sessão), com uma compra paga. */
async function buyer(browser: import('@playwright/test').Browser, name: string) {
  const context = await browser.newContext({ baseURL: WEB });
  const page = await context.newPage();
  const account = await createUnclaimedAccount(page.request, name);
  await signInByRequest(page, account.steamId);
  return { page, context, ...account };
}

async function signInAsStaff(page: Page, role: 'owner' | 'admin' | 'moderator') {
  const server = createServer();
  const steamId = newSteamId();
  await connectPlayer(page.request, server, steamId, `Staff ${role}`);
  await signInByRequest(page, steamId);
  grantStaffRole(steamId, role);
  await page.context().clearCookies();
  await chooseSteamAccount(page.context(), steamId);
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
  await expect(page.getByTestId('stp-home')).toBeVisible();
}

/** Abre a ficha do pagamento pela lista (a linha é de uma Conta com nome único). */
async function openPayment(page: Page, accountName: string) {
  await page.goto('/pagamentos');
  await page.getByTestId('stp-query').fill(accountName);
  await page.getByTestId('stp-row').first().click();
  await expect(page.getByTestId('stp-detail')).toBeVisible();
}

test.describe('Pagamentos no painel', () => {
  test('o Moderador não vê a aba nem entra na tela', async ({ page }) => {
    await signInAsStaff(page, 'moderator');
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Pagamentos' }),
    ).toHaveCount(0);
    expect((await page.goto('/pagamentos'))?.status()).toBe(404);
  });

  test('a lista filtra por estado com a contagem; a ficha mostra o CPF só mascarado e os webhooks', async ({
    page,
    browser,
  }) => {
    const bought = await buyer(browser, 'Painel Pagamentos Lista');
    const paid = await createPurchase(bought.page, { package: 'vip-3m' });
    await simulate(bought.page, paid, 'pay');
    await signInAsStaff(page, 'admin');

    await openPayment(page, 'Painel Pagamentos Lista');
    const detail = page.getByTestId('stp-detail');
    await expect(detail.getByTestId('payment-status')).toContainText('Aprovado');
    await expect(detail.getByTestId('payment-cpf')).toHaveText('***.***.**9-09');
    await expect(detail.getByTestId('payment-events')).toContainText('Aplicado');
    await expect(detail.getByTestId('payment-events')).toContainText('válida');
    await expect(detail.getByTestId('refundable')).toContainText('90 dia(s)');

    // A aba "Aprovados" mantém a linha; "Contestados" não a tem.
    await page.goto('/pagamentos?status=approved');
    await expect(page).toHaveURL(/status=approved$/);
    await page.getByTestId('stp-query').fill('Painel Pagamentos Lista');
    await expect(page.getByTestId('stp-row')).toHaveCount(1);
    await page.goto('/pagamentos?status=charged_back');
    await page.getByTestId('stp-query').fill('Painel Pagamentos Lista');
    await expect(page.getByTestId('stp-row')).toHaveCount(0);
    await bought.context.close();
  });

  test('reembolsar exige motivo e confirmação, devolve os dias e deixa o registro na ficha', async ({
    page,
    browser,
  }) => {
    const bought = await buyer(browser, 'Painel Pagamentos Reembolso');
    const paid = await createPurchase(bought.page, { package: 'vip-1m' });
    await simulate(bought.page, paid, 'pay');
    await signInAsStaff(page, 'owner');

    await openPayment(page, 'Painel Pagamentos Reembolso');
    await page.getByTestId('refund-form-open').click();
    // Sem motivo, nada é enviado.
    await page.getByTestId('refund-form-submit').click();
    await expect(page.getByTestId('refund-form')).toContainText('motivo');
    await expect(page.getByTestId('refund-form-confirm')).toHaveCount(0);

    await page
      .getByTestId('refund-form-reason')
      .fill('Queda de 3 dias em outubro, pedido pelo suporte');
    await page.getByTestId('refund-form-submit').click();
    await expect(page.getByTestId('refund-form-confirm')).toContainText('Não tem volta');
    await page.getByTestId('refund-form-submit').click();

    const detail = page.getByTestId('stp-detail');
    await expect(detail.getByTestId('payment-status')).toContainText('Reembolsado', {
      timeout: 20_000,
    });
    await expect(detail.getByTestId('refund-form-done')).toBeVisible();
    await expect(detail.getByTestId('payment-audit')).toContainText('Reembolsou um pagamento');
    await expect(detail.getByTestId('payment-audit')).toContainText(
      'Queda de 3 dias em outubro, pedido pelo suporte',
    );

    // O comprador vê o reembolso em Minhas compras.
    await bought.page.goto('/settings/purchases');
    await expect(
      bought.page.locator(`[data-purchase-id="${paid.id}"]`).getByTestId('purchase-status'),
    ).toHaveText('Reembolsado');
    await bought.context.close();
  });

  test('reembolso parcial por dias: sobra o resto para devolver', async ({ page, browser }) => {
    const bought = await buyer(browser, 'Painel Pagamentos Parcial');
    const paid = await createPurchase(bought.page, { package: 'vip-3m' });
    await simulate(bought.page, paid, 'pay');
    await signInAsStaff(page, 'admin');

    await openPayment(page, 'Painel Pagamentos Parcial');
    await page.getByTestId('refund-form-open').click();
    await page.getByTestId('refund-days').fill('10');
    await page.getByTestId('refund-form-reason').fill('Indisponibilidade de 10 dias');
    await page.getByTestId('refund-form-submit').click();
    await page.getByTestId('refund-form-submit').click();

    const detail = page.getByTestId('stp-detail');
    await expect(detail.getByTestId('payment-status')).toContainText('Reembolso parcial', {
      timeout: 20_000,
    });
    await bought.context.close();
  });

  test('contestação bloqueia as compras; a Staff reabre depois de revisar', async ({
    page,
    browser,
  }) => {
    const bought = await buyer(browser, 'Painel Pagamentos Contestado');
    const paid = await createPurchase(bought.page);
    await simulate(bought.page, paid, 'pay');
    await simulate(bought.page, paid, 'chargeback');
    await signInAsStaff(page, 'owner');

    await openPayment(page, 'Painel Pagamentos Contestado');
    const detail = page.getByTestId('stp-detail');
    await expect(detail.getByTestId('payment-status')).toContainText('Contestado');
    await expect(detail.getByTestId('unblock-panel')).toContainText('bloqueadas');

    await detail.getByTestId('unblock-form-open').click();
    await detail
      .getByTestId('unblock-form-reason')
      .fill('Contestação revisada: o pagamento era do titular');
    await detail.getByTestId('unblock-form-submit').click();
    await expect(detail.getByTestId('unblock-panel')).toHaveCount(0, { timeout: 20_000 });
    await expect(detail.getByTestId('payment-blocked')).toHaveCount(0);
    await bought.context.close();
  });

  test('as operações: conciliar mostra o resultado e a compensação confirma com os números', async ({
    page,
  }) => {
    await signInAsStaff(page, 'owner');
    await page.goto('/pagamentos');

    await page.getByTestId('reconcile-submit').click();
    await expect(page.getByTestId('reconcile-result')).toContainText('com o provedor', {
      timeout: 20_000,
    });

    // A compensação só chega até a confirmação: aplicar somaria dias a todos os VIPs do banco compartilhado.
    const compensation = page.getByTestId('compensation');
    await expect(compensation).toBeVisible();
    await expect(page.getByTestId('compensation-active')).toBeVisible();
    if ((await page.getByTestId('compensation-form-open').count()) > 0) {
      await page.getByTestId('compensation-form-open').click();
      await page.getByTestId('compensation-form-reason').fill('Queda de teste');
      await page.getByTestId('compensation-form-submit').click();
      await expect(page.getByTestId('compensation-form-confirm')).toContainText('Não tem volta');
    }
  });
});
